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
}

export function makeJobsQueries(db) {
  return {
    insertJob: db.prepare(`
      INSERT INTO turjuman_jobs (id, user_id, source_url, target_lang, status, created_at)
      VALUES (?, ?, ?, ?, 'queued', ?)
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

export function createJob(q, userId, sourceUrl, targetLang) {
  const id = generateUserId();
  q.insertJob.run(id, userId, sourceUrl, targetLang, Date.now());
  return q.findJob.get(id);
}
