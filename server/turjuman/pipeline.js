// Cooperative single-job worker. Called from a setInterval.
// Picks the oldest queued job, claims it atomically, runs the pipeline.

import fs from "node:fs/promises";
import path from "node:path";
import { validateUrl, probe, download } from "./yt-dlp.js";
import { translateVideo } from "./gemini.js";
import { cuesToSrt } from "./srt.js";

const MAX_DURATION_SEC = 30 * 60;
const MAX_FILESIZE_MB = 500;

let _running = false;

export async function tickWorker({ q, jobsRoot, geminiApiKey, log }) {
  if (_running) return;
  _running = true;
  try {
    const job = q.nextQueuedJob.get();
    if (!job) return;

    log(`[turjuman] picking up job ${job.id}`);
    const claim = q.setJobStarted.run(Date.now(), job.id);
    if (claim.changes !== 1) return;

    try {
      const { srtPath, durationSec, charged } = await runJob(job, jobsRoot, geminiApiKey, log);
      log(`[turjuman] job ${job.id} done · ${charged} credits charged`);
      q.setJobDone.run(durationSec, charged, srtPath, Date.now(), job.id);
      q.chargeCredits.run(charged, charged, charged, job.user_id);
    } catch (e) {
      const msg = String(e?.message ?? e).slice(0, 500);
      log(`[turjuman] job ${job.id} failed: ${msg}`);
      q.setJobError.run(msg, Date.now(), job.id);
    }
  } finally {
    _running = false;
  }
}

async function runJob(job, jobsRoot, geminiApiKey, log) {
  const dir = path.join(jobsRoot, job.id);
  await fs.mkdir(dir, { recursive: true });
  const videoPath = path.join(dir, "source.mp4");
  const srtPath = path.join(dir, "translation.srt");

  // Defense-in-depth — also enforced at API layer.
  const v = await validateUrl(job.source_url);
  if (!v.ok) throw new Error(`url_${v.error}`);

  const info = await probe(job.source_url);
  if (info.duration && info.duration > MAX_DURATION_SEC) {
    throw new Error(`too_long:${Math.ceil(info.duration / 60)}min>30min`);
  }
  if (info.filesizeMb && info.filesizeMb > MAX_FILESIZE_MB) {
    throw new Error(`too_large:${info.filesizeMb}MB>${MAX_FILESIZE_MB}MB`);
  }
  const durationSec = info.duration ?? 0;
  const charged = Math.max(1, Math.ceil(durationSec / 60));

  log(`[turjuman] downloading ${job.id} (~${Math.ceil(durationSec / 60)}min)…`);
  await download(job.source_url, videoPath);

  log(`[turjuman] translating ${job.id} via Gemini…`);
  const bytes = await fs.readFile(videoPath);
  const cues = await translateVideo({
    apiKey: geminiApiKey,
    videoBytes: bytes,
    mimeType: "video/mp4",
    targetLang: job.target_lang,
  });

  const srt = cuesToSrt(cues);
  await fs.writeFile(srtPath, srt, "utf8");
  await fs.unlink(videoPath).catch(() => {});

  return { srtPath, durationSec, charged };
}
