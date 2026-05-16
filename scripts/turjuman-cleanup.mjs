#!/usr/bin/env node
// Daily cleanup for Turjuman:
//   - delete `done` jobs older than 30 days (DB row + on-disk artifacts)
//   - delete `error`/`queued`/`processing` jobs older than 7 days (stuck or failed; user already knows)
//   - delete consumed magic tokens older than 1 day, expired-unconsumed older than 1 day
//   - prune empty turjuman-jobs/* directories
//
// Run via cron daily on the VPS (see install-vps-cron.sh).

import Database from "better-sqlite3";
import { existsSync, rmSync, readdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";

const APP = process.env.APP_DIR || "/home/alkinani/htdocs/alkinani.live";
const DB = join(APP, "leaderboard.db");
const JOBS_ROOT = join(APP, "turjuman-jobs");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const db = new Database(DB);
db.pragma("journal_mode = WAL");

function deleteJobsArtifacts(jobIds) {
  let removed = 0;
  for (const id of jobIds) {
    const dir = join(JOBS_ROOT, id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

const oldDone = db
  .prepare(`SELECT id FROM turjuman_jobs WHERE status = 'done' AND completed_at < ?`)
  .all(NOW - 30 * DAY)
  .map((r) => r.id);

const oldFailedOrStuck = db
  .prepare(
    `SELECT id FROM turjuman_jobs
     WHERE status IN ('error','queued','processing')
       AND created_at < ?`,
  )
  .all(NOW - 7 * DAY)
  .map((r) => r.id);

const allDeletable = [...oldDone, ...oldFailedOrStuck];
let dbDeleted = 0;
let fsDeleted = 0;

if (allDeletable.length > 0) {
  fsDeleted = deleteJobsArtifacts(allDeletable);
  const placeholders = allDeletable.map(() => "?").join(",");
  const res = db
    .prepare(`DELETE FROM turjuman_jobs WHERE id IN (${placeholders})`)
    .run(...allDeletable);
  dbDeleted = res.changes;
}

// Magic tokens
const tokenRes = db
  .prepare(
    `DELETE FROM turjuman_magic_tokens
     WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
        OR (consumed_at IS NULL AND expires_at < ?)`,
  )
  .run(NOW - 1 * DAY, NOW - 1 * DAY);

// Prune empty job directories
let prunedDirs = 0;
if (existsSync(JOBS_ROOT)) {
  for (const name of readdirSync(JOBS_ROOT)) {
    const dir = join(JOBS_ROOT, name);
    try {
      if (readdirSync(dir).length === 0) {
        rmdirSync(dir);
        prunedDirs++;
      }
    } catch {
      // not a dir or already gone — skip
    }
  }
}

const stamp = new Date().toISOString();
console.log(
  `[${stamp}] turjuman-cleanup: db_jobs=${dbDeleted} fs_dirs=${fsDeleted} done=${oldDone.length} stuck=${oldFailedOrStuck.length} tokens=${tokenRes.changes} pruned_empty=${prunedDirs}`,
);

db.close();
