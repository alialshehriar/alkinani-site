// Cooperative single-job worker. Called from a setInterval.
// Picks the oldest queued job, claims it atomically, runs the pipeline.

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateUrl, probe, download } from "./yt-dlp.js";
import { translateMedia, translateChunked } from "./gemini.js";
import { cuesToSrt } from "./srt.js";
import { burnSubtitles, extractAudio, chunkAudio, measureMeanVolume } from "./ffmpeg.js";
import { incrementAnonUsed } from "./db.js";
import { emitJobEvent } from "./job-events.js";

const MAX_DURATION_SEC = 30 * 60;       // strict 30-min ceiling per clip
const MAX_FILESIZE_MB = 500;

function readPositiveNumberEnv(name, fallback, { min = 1, max = Infinity } = {}) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function defaultChunkConcurrency(durationSec) {
  return durationSec >= 10 * 60 ? 3 : 2;
}

/**
 * Read duration from a local video file via ffprobe.
 */
function ffprobeLocal(filePath) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err.slice(0, 200)}`));
      const duration = parseFloat(out.trim());
      if (!Number.isFinite(duration)) return reject(new Error("ffprobe parse failed"));
      resolve({ duration });
    });
  });
}

let _running = false;

export async function tickWorker({ q, userQ, jobsRoot, geminiApiKey, log }) {
  if (_running) return;
  _running = true;
  try {
    const recovered = q.requeueInterruptedJobs?.run();
    if (recovered?.changes) {
      log(`[turjuman] recovered ${recovered.changes} interrupted processing job(s)`);
    }

    const job = q.nextQueuedJob.get();
    if (!job) return;

    log(`[turjuman] picking up job ${job.id}`);
    const claim = q.setJobStarted.run(Date.now(), job.id);
    if (claim.changes !== 1) return;
    emitJobEvent(job.id, { stage: "started", pct: 0 });

    try {
      const { srtPath, mp4Path, durationSec, charged } = await runJob(job, jobsRoot, geminiApiKey, log);
      const isAnon = job.user_id?.startsWith("anon:");
      log(`[turjuman] job ${job.id} done · ${charged} credits charged · ${isAnon ? "anon" : "user"}`);
      q.setJobDone.run(durationSec, charged, srtPath, mp4Path, Date.now(), job.id);
      if (isAnon) {
        incrementAnonUsed(userQ, job.user_id.slice(5), charged);
      } else {
        q.chargeCredits.run(charged, charged, charged, job.user_id);
      }
      emitJobEvent(job.id, { stage: "done", pct: 100, charged });
    } catch (e) {
      const msg = String(e?.message ?? e).slice(0, 500);
      log(`[turjuman] job ${job.id} failed: ${msg}`);
      q.setJobError.run(msg, Date.now(), job.id);
      emitJobEvent(job.id, { stage: "error", pct: 100, error: msg });
    }
  } finally {
    _running = false;
  }
}

async function runJob(job, jobsRoot, geminiApiKey, log) {
  const dir = path.join(jobsRoot, job.id);
  await fs.mkdir(dir, { recursive: true });
  const srtPath = path.join(dir, "translation.srt");
  const mp4Path = path.join(dir, "translated.mp4");

  let videoPath;
  let durationSec;

  if (job.source_url.startsWith("file://")) {
    // Uploaded file — already on disk. Probe with ffprobe instead of yt-dlp.
    emitJobEvent(job.id, { stage: "probing", pct: 5 });
    videoPath = job.source_url.slice(7);
    const probed = await ffprobeLocal(videoPath);
    if (probed.duration && probed.duration > MAX_DURATION_SEC) {
      throw new Error(`too_long:${Math.ceil(probed.duration / 60)}min>${MAX_DURATION_SEC / 60}min`);
    }
    durationSec = probed.duration ?? 0;
  } else {
    // URL — go through yt-dlp (with Cobalt fallback inside download()).
    emitJobEvent(job.id, { stage: "probing", pct: 5 });
    const v = await validateUrl(job.source_url);
    if (!v.ok) throw new Error(`url_${v.error}`);

    // Best-effort probe: if yt-dlp can't see the URL (YouTube datacenter
    // block, geo gate), skip the upfront duration/size guard and let
    // Cobalt fetch the bytes — we'll re-check duration via ffprobe after
    // download instead. Without this, probe() throws and the job aborts
    // before download() ever gets a chance to try Cobalt.
    let probeDuration = 0;
    try {
      const info = await probe(job.source_url);
      if (info.duration && info.duration > MAX_DURATION_SEC) {
        throw new Error(`too_long:${Math.ceil(info.duration / 60)}min>${MAX_DURATION_SEC / 60}min`);
      }
      if (info.filesizeMb && info.filesizeMb > MAX_FILESIZE_MB) {
        throw new Error(`too_large:${info.filesizeMb}MB>${MAX_FILESIZE_MB}MB`);
      }
      probeDuration = info.duration ?? 0;
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/^too_(long|large):/.test(msg)) throw e;
      log(`[turjuman] probe failed for ${job.id} — deferring duration check to post-download (${msg.slice(0, 100)})`);
    }
    videoPath = path.join(dir, "source.mp4");
    log(`[turjuman] downloading ${job.id}${probeDuration ? ` (~${Math.ceil(probeDuration / 60)}min)` : ""}…`);
    emitJobEvent(job.id, { stage: "downloading", pct: 15, durationSec: probeDuration });
    const tDl = Date.now();
    const dlResult = await download(job.source_url, videoPath);
    log(`[turjuman] download took ${((Date.now() - tDl) / 1000).toFixed(1)}s${dlResult?.source ? ` (via ${dlResult.source})` : ""}`);
    if (dlResult?.source === "cobalt") {
      log(`[turjuman] ${job.id} downloaded via Cobalt fallback`);
    }
    // Always verify duration on the actual file — probe was best-effort.
    const local = await ffprobeLocal(videoPath).catch(() => ({ duration: probeDuration }));
    if (local.duration && local.duration > MAX_DURATION_SEC) {
      await fs.unlink(videoPath).catch(() => {});
      throw new Error(`too_long:${Math.ceil(local.duration / 60)}min>${MAX_DURATION_SEC / 60}min`);
    }
    durationSec = local.duration || probeDuration || 0;
  }

  const charged = Math.max(1, Math.ceil(durationSec / 60));

  // Extract speech-optimized audio first. Gemini can subtitle from audio
  // alone, and a mono 64kbps track is far smaller than the source video,
  // which cuts upload time without paying a subtitle-quality penalty.
  const tAudio = Date.now();
  log(`[turjuman] extracting audio for ${job.id}…`);
  emitJobEvent(job.id, { stage: "translating", pct: 35, durationSec, charged });
  let audio;
  try {
    audio = await extractAudio(videoPath);
    log(`[turjuman] audio extract took ${((Date.now() - tAudio) / 1000).toFixed(1)}s`);
  } catch (e) {
    log(`[turjuman] audio extract failed (${String(e?.message || e).slice(0, 80)}) — falling back to full video`);
    audio = null;
  }

  // Pre-flight silent-audio gate. ~38% of historical gemini_no_cues errors
  // turned out to be silent or music-only clips (background-music vlogs,
  // typing tutorials, gaming highlights with FX-only audio). Gemini happily
  // burns a paid token round-trip on these and returns either zero cues or
  // a single hallucinated filler line. Reject up-front with a clear error
  // the UI can render in Arabic.
  //
  // -45 dBFS is the empirical floor below which our gemini_no_cues rate
  // exceeded 90%. Skip the gate when ffmpeg can't read the audio at all
  // (measureMeanVolume returns null) — don't compound an extraction failure
  // with a false-positive silence reject.
  if (audio?.path) {
    const meanDb = await measureMeanVolume(audio.path);
    if (meanDb !== null && meanDb < -45) {
      await fs.unlink(audio.path).catch(() => {});
      await fs.unlink(videoPath).catch(() => {});
      throw new Error(`silent_audio:${meanDb.toFixed(1)}dB`);
    }
    if (meanDb !== null) {
      log(`[turjuman] audio mean volume ${meanDb.toFixed(1)} dBFS (gate at -45)`);
    }
  }

  log(`[turjuman] translating ${job.id} via Gemini…`);
  emitJobEvent(job.id, { stage: "translating", pct: 40, durationSec, charged });
  const tGen = Date.now();

  // For long clips, split the audio into 60-second chunks and translate
  // them in parallel. A single Gemini call drifts in timestamp estimation
  // over 5+ minute audio (cues "wander" off the speech by 10-30 seconds);
  // chunking gives every cue a fresh ≤60s window so the timing stays tight.
  // Threshold is conservative — short clips (<2 min) still run in one shot
  // because the chunking overhead would outweigh the timing benefit.
  const CHUNK_THRESHOLD_SEC = readPositiveNumberEnv("GEMINI_CHUNK_THRESHOLD_SEC", 120, { min: 30, max: 600 });
  const CHUNK_LEN_SEC = readPositiveNumberEnv("GEMINI_CHUNK_SECONDS", 60, { min: 30, max: 120 });
  let cues;
  try {
    if (audio?.path && durationSec > CHUNK_THRESHOLD_SEC) {
      log(`[turjuman] long clip (${Math.ceil(durationSec / 60)}min) — chunking audio @ ${CHUNK_LEN_SEC}s`);
      const chunks = await chunkAudio(audio.path, CHUNK_LEN_SEC);
      const measuredDuration = chunks.reduce((sum, ch) => sum + (ch.durationSec || 0), 0);
      const chunkConcurrency = readPositiveNumberEnv(
        "GEMINI_CHUNK_CONCURRENCY",
        defaultChunkConcurrency(durationSec),
        { min: 1, max: 4 }
      );
      log(
        `[turjuman] produced ${chunks.length} chunks` +
        `${measuredDuration ? ` (${measuredDuration.toFixed(1)}s measured)` : ""}` +
        ` @ concurrency ${chunkConcurrency}`
      );
      try {
        cues = await translateChunked({
          apiKey: geminiApiKey,
          chunks,
          mimeType: audio.mimeType,
          targetLang: job.target_lang,
          sourceLang: job.source_lang ?? null,
          log,
          concurrency: chunkConcurrency,
          onProgress: ({ completed, total }) => {
            const pct = Math.min(70, 40 + Math.round((completed / total) * 30));
            emitJobEvent(job.id, { stage: "translating", pct, durationSec, charged });
          },
        });
      } finally {
        // Clean up chunk files even when Gemini fails.
        for (const ch of chunks) await fs.unlink(ch.path).catch(() => {});
      }
    } else {
      cues = await translateMedia({
        apiKey: geminiApiKey,
        mediaPath: audio?.path ?? videoPath,
        mimeType: audio?.mimeType ?? "video/mp4",
        targetLang: job.target_lang,
        sourceLang: job.source_lang ?? null,
        log,
      });
    }
  } finally {
    // Audio file is no longer needed once cues are back, and should not
    // linger when Gemini throws.
    if (audio?.path) await fs.unlink(audio.path).catch(() => {});
  }
  log(`[turjuman] translate (gemini total) took ${((Date.now() - tGen) / 1000).toFixed(1)}s · ${cues.length} cues`);
  logCueQuality(cues, durationSec, log);

  const srt = cuesToSrt(cues);
  await fs.writeFile(srtPath, srt, "utf8");
  emitJobEvent(job.id, { stage: "burning", pct: 75 });

  log(`[turjuman] burning subtitles into video for ${job.id}…`);
  const tBurn = Date.now();
  await burnSubtitles({
    videoPath,
    srtPath,
    outPath: mp4Path,
    targetLang: job.target_lang,
    subtitleSize: job.subtitle_size ?? null,
  });
  log(`[turjuman] burn took ${((Date.now() - tBurn) / 1000).toFixed(1)}s`);
  emitJobEvent(job.id, { stage: "finalizing", pct: 95 });

  // Source no longer needed — only keep the burned MP4 + SRT.
  await fs.unlink(videoPath).catch(() => {});

  return { srtPath, mp4Path, durationSec, charged };
}

function logCueQuality(cues, durationSec, log) {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !Array.isArray(cues)) return;
  const cueSeconds = cues.reduce((sum, c) => sum + Math.max(0, Math.min(7, c.end - c.start)), 0);
  const cuesPerMin = cues.length / Math.max(1, durationSec / 60);
  const coveragePct = Math.round((cueSeconds / durationSec) * 100);
  const lastEnd = cues.reduce((max, c) => Math.max(max, c.end), 0);
  log(
    `[turjuman] cue quality: ${cues.length} cues · ${cuesPerMin.toFixed(1)} cues/min` +
    ` · ${coveragePct}% subtitle coverage · last cue @ ${lastEnd.toFixed(1)}s`
  );
  if (durationSec >= 120 && cues.length < Math.max(5, durationSec / 30)) {
    log(`[turjuman] cue quality warning: unusually sparse subtitles for ${Math.round(durationSec)}s media`);
  }
  if (lastEnd > durationSec + 10) {
    log(`[turjuman] cue quality warning: cues extend beyond media duration by ${(lastEnd - durationSec).toFixed(1)}s`);
  }
}
