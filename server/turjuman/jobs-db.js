// Jobs table for the translation pipeline.
// Lives in the same SQLite file as turjuman_users.

import { generateUserId } from "./auth.js";

export function ensureJobsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS turjuman_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES turjuman_users(id),
      source_url TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_seconds INTEGER,
      credits_charged INTEGER DEFAULT 0,
      error_message TEXT,
      output_srt_path TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tj_jobs_user ON turjuman_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_tj_jobs_status ON turjuman_jobs(status);
  `);
  // Forward-compatible column adds (idempotent).
  try { db.exec("ALTER TABLE turjuman_jobs ADD COLUMN output_mp4_path TEXT"); } catch {}
  // Optional user-supplied source language hint ("ar"/"en"/"es"/"zh" or NULL for auto-detect).
  try { db.exec("ALTER TABLE turjuman_jobs ADD COLUMN source_lang TEXT"); } catch {}
  // Subtitle size preference: 'S' | 'M' | 'L'. NULL → treat as 'M' (default).
  try { db.exec("ALTER TABLE turjuman_jobs ADD COLUMN subtitle_size TEXT"); } catch {}
}

export function makeJobsQueries(db) {
  return {
    insertJob: db.prepare(`
      INSERT INTO turjuman_jobs (id, user_id, source_url, target_lang, source_lang, subtitle_size, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)
    `),
    findJob: db.prepare(`SELECT * FROM turjuman_jobs WHERE id = ?`),
    listUserJobs: db.prepare(`
      SELECT * FROM turjuman_jobs WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 20
    `),
    nextQueuedJob: db.prepare(`
      SELECT * FROM turjuman_jobs WHERE status = 'queued'
      ORDER BY created_at ASC LIMIT 1
    `),
    requeueInterruptedJobs: db.prepare(`
      UPDATE turjuman_jobs
      SET status = 'queued', started_at = NULL, error_message = NULL
      WHERE status = 'processing' AND completed_at IS NULL
    `),
    setJobStarted: db.prepare(`
      UPDATE turjuman_jobs SET status = 'processing', started_at = ?
      WHERE id = ? AND status = 'queued'
    `),
    setJobDone: db.prepare(`
      UPDATE turjuman_jobs SET status = 'done',
        duration_seconds = ?, credits_charged = ?,
        output_srt_path = ?, output_mp4_path = ?, completed_at = ?
      WHERE id = ?
    `),
    setJobError: db.prepare(`
      UPDATE turjuman_jobs SET status = 'error',
        error_message = ?, completed_at = ?
      WHERE id = ?
    `),
    updateJobSource: db.prepare(`
      UPDATE turjuman_jobs SET source_url = ? WHERE id = ?
    `),
    // Charge credits — free first, then paid.
    chargeCredits: db.prepare(`
      UPDATE turjuman_users
      SET free_credits_remaining = MAX(0, free_credits_remaining - ?),
          credits_balance = MAX(0, credits_balance -
            CASE WHEN ? > free_credits_remaining
                 THEN ? - free_credits_remaining
                 ELSE 0 END)
      WHERE id = ?
    `),
  };
}

/**
 * Create a queued job. `sourceLang` is optional: pass null/undefined for
 * Gemini auto-detect, or one of "ar"/"en"/"es"/"zh" when the user picked it
 * explicitly. `subtitleSize` ∈ {"S","M","L"} controls burn-in font scale,
 * defaulting to "M" when omitted.
 */
export function createJob(q, userId, sourceUrl, targetLang, sourceLang, subtitleSize) {
  const id = generateUserId();
  q.insertJob.run(
    id,
    userId,
    sourceUrl,
    targetLang,
    sourceLang ?? null,
    subtitleSize ?? null,
    Date.now()
  );
  return q.findJob.get(id);
}
