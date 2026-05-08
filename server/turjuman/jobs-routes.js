// Express router for /api/turjuman/jobs/*

import express from "express";
import fs from "node:fs/promises";
import {
  readSessionCookie,
  readAnonCookie,
  buildAnonCookie,
  generateUserId,
} from "./auth.js";
import {
  readSession,
  getOrCreateAnonQuota,
  ANON_FREE_MINUTES,
} from "./db.js";
import { createJob } from "./jobs-db.js";
import { validateUrl } from "./yt-dlp.js";

const ALLOWED_TARGETS = new Set(["ar", "en", "es"]);

export function jobsRouter({ q, jobsQ, isProduction }) {
  const router = express.Router();

  function authenticate(req, res, next) {
    const sid = readSessionCookie(req);
    if (!sid) return res.status(401).json({ error: "unauthenticated" });
    const session = readSession(q, sid);
    if (!session) return res.status(401).json({ error: "session_expired" });
    req.userId = session.user_id;
    next();
  }

  /**
   * Resolves the requester to a userId. Three cases:
   *   1. Authenticated session → real user_id
   *   2. Anonymous with quota left → "anon:<anonId>" + Set-Cookie if new
   *   3. Anonymous over quota → 402 (Payment Required)
   */
  function resolveRequester(req, res) {
    const sid = readSessionCookie(req);
    if (sid) {
      const session = readSession(q, sid);
      if (session) {
        return { kind: "user", userId: session.user_id };
      }
    }
    let anonId = readAnonCookie(req);
    if (!anonId) {
      anonId = generateUserId();
      res.set("Set-Cookie", buildAnonCookie(anonId, isProduction));
    }
    const quota = getOrCreateAnonQuota(q, anonId, req.ip);
    return {
      kind: "anon",
      anonId,
      userId: `anon:${anonId}`,
      quotaRemaining: ANON_FREE_MINUTES - quota.minutes_used,
    };
  }

  router.post("/", async (req, res) => {
    const url = (req.body?.url ?? "").trim();
    const target = (req.body?.target_lang ?? "ar").trim();
    if (!ALLOWED_TARGETS.has(target)) {
      return res.status(400).json({ error: "invalid_target_lang" });
    }
    const v = await validateUrl(url);
    if (!v.ok) return res.status(400).json({ error: `url_${v.error}` });

    const me = resolveRequester(req, res);
    if (me.kind === "anon" && me.quotaRemaining <= 0) {
      return res.status(402).json({
        error: "anonymous_quota_exceeded",
        free_minutes_used: ANON_FREE_MINUTES,
      });
    }

    const job = createJob(jobsQ, me.userId, url, target);
    return res.json({ job });
  });

  // Resolver that doesn't 402 — returns whichever ID is in play (real or anon)
  function whoami(req) {
    const sid = readSessionCookie(req);
    if (sid) {
      const session = readSession(q, sid);
      if (session) return session.user_id;
    }
    const anonId = readAnonCookie(req);
    return anonId ? `anon:${anonId}` : null;
  }

  router.get("/", (req, res) => {
    const userId = whoami(req);
    if (!userId) return res.json({ jobs: [] });
    const jobs = jobsQ.listUserJobs.all(userId);
    return res.json({ jobs });
  });

  router.get("/:id", (req, res) => {
    const userId = whoami(req);
    const job = jobsQ.findJob.get(req.params.id);
    if (!job || job.user_id !== userId) {
      return res.status(404).json({ error: "not_found" });
    }
    return res.json({ job });
  });

  router.get("/:id/srt", async (req, res) => {
    const userId = whoami(req);
    const job = jobsQ.findJob.get(req.params.id);
    if (!job || job.user_id !== userId) return res.status(404).end();
    if (!job.output_srt_path) return res.status(409).json({ error: "not_ready" });
    try {
      const data = await fs.readFile(job.output_srt_path, "utf8");
      res.set("Content-Type", "application/x-subrip; charset=utf-8");
      res.set(
        "Content-Disposition",
        `attachment; filename="turjuman-${job.id}.srt"`
      );
      return res.send(data);
    } catch {
      return res.status(410).json({ error: "file_missing" });
    }
  });

  router.get("/:id/mp4", async (req, res) => {
    const userId = whoami(req);
    const job = jobsQ.findJob.get(req.params.id);
    if (!job || job.user_id !== userId) return res.status(404).end();
    if (!job.output_mp4_path) return res.status(409).json({ error: "not_ready" });
    res.set("Content-Type", "video/mp4");
    res.set(
      "Content-Disposition",
      `attachment; filename="turjuman-${job.id}.mp4"`
    );
    return res.sendFile(job.output_mp4_path, (err) => {
      if (err && !res.headersSent) res.status(410).json({ error: "file_missing" });
    });
  });

  // GET /api/turjuman/jobs/quota/me — what does this requester have left?
  router.get("/quota/me", (req, res) => {
    const sid = readSessionCookie(req);
    if (sid) {
      const session = readSession(q, sid);
      if (session) {
        return res.json({ kind: "user", session_user_id: session.user_id });
      }
    }
    const anonId = readAnonCookie(req);
    if (!anonId) {
      return res.json({
        kind: "anon_fresh",
        free_remaining: ANON_FREE_MINUTES,
        free_total: ANON_FREE_MINUTES,
      });
    }
    const quota = q.findAnonQuota.get(anonId) ?? { minutes_used: 0 };
    return res.json({
      kind: "anon",
      free_remaining: Math.max(0, ANON_FREE_MINUTES - quota.minutes_used),
      free_total: ANON_FREE_MINUTES,
    });
  });

  return router;
}
