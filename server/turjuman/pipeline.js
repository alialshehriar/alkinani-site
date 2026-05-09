// Cooperative single-job worker. Called from a setInterval.
// Picks the oldest queued job, claims it atomically, runs the pipeline.

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateUrl, probe, download } from "./yt-dlp.js";
import { translateVideo } from "./gemini.js";
import { cuesToSrt } from "./srt.js";
import { burnSubtitles } from "./ffmpeg.js";
import { incrementAnonUsed } from "./db.js";
import { emitJobEvent } from "./job-events.js";

const MAX_DURATION_SEC = 30 * 60;       // strict 30-min ceiling per clip
const MAX_FILESIZE_MB = 500;

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
    const dlResult = await download(job.source_url, videoPath);
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

  log(`[turjuman] translating ${job.id} via Gemini…`);
  emitJobEvent(job.id, { stage: "translating", pct: 40, durationSec, charged });
  const bytes = await fs.readFile(videoPath);
  const cues = await translateVideo({
    apiKey: geminiApiKey,
    videoBytes: bytes,
    mimeType: "video/mp4",
    targetLang: job.target_lang,
  });

  const srt = cuesToSrt(cues);
  await fs.writeFile(srtPath, srt, "utf8");
  emitJobEvent(job.id, { stage: "burning", pct: 75 });

  log(`[turjuman] burning subtitles into video for ${job.id}…`);
  await burnSubtitles({ videoPath, srtPath, outPath: mp4Path, targetLang: job.target_lang });
  emitJobEvent(job.id, { stage: "finalizing", pct: 95 });

  // Source no longer needed — only keep the burned MP4 + SRT.
  await fs.unlink(videoPath).catch(() => {});

  return { srtPath, mp4Path, durationSec, charged };
}
