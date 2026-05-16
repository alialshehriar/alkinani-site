// Express router for /api/turjuman/jobs/*

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import Busboy from "busboy";
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
import { subscribeToJob } from "./job-events.js";

const ALLOWED_TARGETS = new Set(["ar", "en", "es", "zh"]);

export function jobsRouter({ q, jobsQ, jobsRoot, isProduction }) {
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

  // POST /api/turjuman/jobs/upload — multipart upload from device
  // Body: multipart/form-data { file, target_lang }
  router.post("/upload", (req, res) => {
    const me = resolveRequester(req, res);
    if (me.kind === "anon" && me.quotaRemaining <= 0) {
      return res.status(402).json({ error: "anonymous_quota_exceeded" });
    }

    const ct = req.headers["content-type"] ?? "";
    if (!ct.toLowerCase().startsWith("multipart/form-data")) {
      return res.status(400).json({ error: "expect_multipart" });
    }

    const fields = {};
    let tempPath = null;
    let savedExt = "mp4";
    let aborted = false;
    const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
    const tempDir = path.join(jobsRoot, "_uploads");

    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_BYTES },
    });

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", async (_name, stream, info) => {
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch {}
      const tempName = `${generateUserId()}-${Date.now()}.part`;
      tempPath = path.join(tempDir, tempName);
      const ext = (info.filename ?? "upload.mp4").split(".").pop().toLowerCase();
      if (/^[a-z0-9]{2,5}$/.test(ext)) savedExt = ext;
      const ws = createWriteStream(tempPath);
      stream.on("limit", () => {
        aborted = true;
        ws.destroy();
        fs.unlink(tempPath).catch(() => {});
      });
      stream.pipe(ws);
    });

    bb.on("close", async () => {
      if (aborted) return res.status(413).json({ error: "file_too_large" });
      if (!tempPath) return res.status(400).json({ error: "no_file" });

      const target = (fields.target_lang ?? "ar").trim();
      if (!ALLOWED_TARGETS.has(target)) {
        await fs.unlink(tempPath).catch(() => {});
        return res.status(400).json({ error: "invalid_target_lang" });
      }

      // Create job first, then move temp file into the job's dir under a
      // deterministic name. Pipeline reads file:// path directly.
      const sourceRefPlaceholder = "upload://"; // overwritten below
      const job = createJob(jobsQ, me.userId, sourceRefPlaceholder, target);
      const jobDir = path.join(jobsRoot, job.id);
      await fs.mkdir(jobDir, { recursive: true });
      const finalPath = path.join(jobDir, `source.${savedExt}`);
      await fs.rename(tempPath, finalPath);

      const finalRef = `file://${finalPath}`;
      jobsQ.updateJobSource.run(finalRef, job.id);
      const refreshed = jobsQ.findJob.get(job.id);

      return res.json({ job: refreshed });
    });

    bb.on("error", (err) => {
      console.error("[turjuman] upload busboy error:", err);
      if (!res.headersSent) res.status(500).json({ error: "upload_failed" });
    });

    req.pipe(bb);
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

  // GET /api/turjuman/jobs/:id/stream — SSE channel for live progress.
  //
  // The pipeline emits events like {stage:"downloading",pct:15} so the UI
  // can replace its 3s polling with real-time updates. The connection
  // closes itself once a terminal "done"/"error" event is received.
  router.get("/:id/stream", (req, res) => {
    const userId = whoami(req);
    const job = jobsQ.findJob.get(req.params.id);
    if (!job || job.user_id !== userId) {
      return res.status(404).end();
    }

    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Nginx: defeat default response buffering
    });
    res.flushHeaders?.();
    res.write(`retry: 3000\n\n`);

    // Replay last-known status from the DB so a freshly-opened tab gets
    // immediate context even if the pipeline hasn't fired an event yet.
    if (job.status === "done" || job.status === "error") {
      res.write(
        `event: ${job.status === "done" ? "done" : "error"}\n` +
        `data: ${JSON.stringify({ stage: job.status, pct: 100 })}\n\n`
      );
      res.end();
      return;
    }

    const send = (evt) => {
      const eventName = evt.stage === "done" || evt.stage === "error"
        ? evt.stage : "progress";
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(evt)}\n\n`);
      if (evt.stage === "done" || evt.stage === "error") {
        res.end();
      }
    };

    const unsub = subscribeToJob(job.id, send);

    // Heartbeat every 20s so middlemen (nginx, CF) don't kill idle conns.
    const hb = setInterval(() => res.write(`: ping\n\n`), 20_000);

    req.on("close", () => {
      clearInterval(hb);
      unsub();
    });
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
