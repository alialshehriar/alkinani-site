// Express router for /api/turjuman/jobs/*

import express from "express";
import fs from "node:fs/promises";
import { readSessionCookie } from "./auth.js";
import { readSession } from "./db.js";
import { createJob } from "./jobs-db.js";
import { validateUrl } from "./yt-dlp.js";

const ALLOWED_TARGETS = new Set(["ar", "en", "es"]);

export function jobsRouter({ q, jobsQ }) {
  const router = express.Router();

  function authenticate(req, res, next) {
    const sid = readSessionCookie(req);
    if (!sid) return res.status(401).json({ error: "unauthenticated" });
    const session = readSession(q, sid);
    if (!session) return res.status(401).json({ error: "session_expired" });
    req.userId = session.user_id;
    next();
  }

  router.post("/", authenticate, async (req, res) => {
    const url = (req.body?.url ?? "").trim();
    const target = (req.body?.target_lang ?? "ar").trim();
    if (!ALLOWED_TARGETS.has(target)) {
      return res.status(400).json({ error: "invalid_target_lang" });
    }
    const v = await validateUrl(url);
    if (!v.ok) return res.status(400).json({ error: `url_${v.error}` });

    const job = createJob(jobsQ, req.userId, url, target);
    return res.json({ job });
  });

  router.get("/", authenticate, (req, res) => {
    const jobs = jobsQ.listUserJobs.all(req.userId);
    return res.json({ jobs });
  });

  router.get("/:id", authenticate, (req, res) => {
    const job = jobsQ.findJob.get(req.params.id);
    if (!job || job.user_id !== req.userId) {
      return res.status(404).json({ error: "not_found" });
    }
    return res.json({ job });
  });

  router.get("/:id/srt", authenticate, async (req, res) => {
    const job = jobsQ.findJob.get(req.params.id);
    if (!job || job.user_id !== req.userId) return res.status(404).end();
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

  return router;
}
