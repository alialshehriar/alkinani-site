# Turjuman — Plan B: Pipeline MVP (URL → Translated SRT)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Authenticated user pastes a video URL on `alkinani.live/tools/turjuman`, gets back a translated `.srt` file in their target language. End-to-end working pipeline on the Hostinger VPS, no Cloudflare, no separate worker box.

**Architecture:** New `/api/turjuman/jobs` endpoints on the existing Express server. yt-dlp + ffmpeg installed on the VPS via apt. ASR + translation in a single Gemini 2.5 Pro multimodal call (it accepts video and returns timed transcription + translation in one shot). Async pipeline: Express creates a job row, returns `job_id` immediately, a background worker runs the pipeline, the client polls every 2 seconds. Outputs land in `/home/alkinani/htdocs/alkinani.live/turjuman-jobs/<job_id>/` and stream back through signed-URL Express endpoints.

**Tech Stack:**
- yt-dlp (apt or pip — pip preferred, daily-updated)
- ffmpeg (apt)
- Google Gemini API (`gemini-2.5-pro` for video; new env var `GEMINI_API_KEY`)
- better-sqlite3 (existing) — adds `turjuman_jobs` table
- node:child_process (spawn yt-dlp + ffmpeg)

**Out of scope (Plan B2):** file upload, burned MP4, interactive player edits, share links, Plan-A's CPL tiers 2/3/6.

**Reference:** `docs/superpowers/specs/2026-05-08-turjuman-design.md` Section 3 (Architecture), Section 4 (CPL — only Tier 5 is in scope here), Section 5 (Source acquisition — yt-dlp Tier 1 only).

---

## File Map

| File | Responsibility | Status |
|---|---|---|
| `server/turjuman/jobs-db.js` | NEW — SQLite migration + queries for `turjuman_jobs` table |
| `server/turjuman/pipeline.js` | NEW — async worker: download → extract → Gemini → write SRT |
| `server/turjuman/yt-dlp.js` | NEW — wrap `yt-dlp --print-json` + safe URL validation (SSRF guard) |
| `server/turjuman/gemini.js` | NEW — Gemini 2.5 Pro video translation client |
| `server/turjuman/srt.js` | NEW — SRT formatter (Netflix-grade line breaks + char limits) |
| `server/turjuman/jobs-routes.js` | NEW — Express router for `/api/turjuman/jobs/*` |
| `server/server.mjs` | MODIFY — mount jobs router, kick off worker tick on interval |
| `server/turjuman/__tests__/srt.test.js` | NEW — node --test for formatter |
| `server/turjuman/__tests__/gemini-parse.test.js` | NEW — node --test for Gemini response parsing |
| `src/components/turjuman/Dashboard.tsx` | REPLACE placeholder body with `<NewJob />` + `<JobsList />` |
| `src/components/turjuman/NewJob.tsx` | NEW — URL input + target-lang selector + submit |
| `src/components/turjuman/JobsList.tsx` | NEW — list + status badges + download buttons |
| `src/components/turjuman/JobRow.tsx` | NEW — single job row with progress |
| `src/lib/turjuman.ts` | EXTEND — `createJob`, `listJobs`, `pollJob` |
| `scripts/deploy-all.sh` | MODIFY — `apt install yt-dlp ffmpeg` on first VPS deploy step |

---

## Phase 1 — VPS Provisioning

### Task 1: Install yt-dlp + ffmpeg on the VPS

**Files:** none (remote operation)

- [ ] **Step 1: Install ffmpeg via apt**

Run:
```bash
ssh root@72.62.116.92 "apt-get update -qq && apt-get install -y ffmpeg && ffmpeg -version | head -1"
```
Expected: `ffmpeg version 4.x` or higher.

- [ ] **Step 2: Install yt-dlp via pip (auto-updatable)**

Run:
```bash
ssh root@72.62.116.92 "apt-get install -y python3-pip && python3 -m pip install --break-system-packages -U yt-dlp && yt-dlp --version"
```
Expected: a date-stamp version like `2026.04.30`.

- [ ] **Step 3: Wire daily yt-dlp upgrade cron**

Run:
```bash
ssh root@72.62.116.92 "(crontab -l 2>/dev/null | grep -v 'yt-dlp -U'; echo '0 5 * * * /usr/bin/python3 -m pip install --break-system-packages -U yt-dlp >/dev/null 2>&1') | crontab -"
```
Expected: cron line installed.

- [ ] **Step 4: Verify alkinani user can run both binaries**

Run:
```bash
ssh root@72.62.116.92 "sudo -u alkinani bash -lc 'which yt-dlp ffmpeg'"
```
Expected: paths to both binaries.

---

### Task 2: Add `GEMINI_API_KEY` to VPS env

**Files:** none

- [ ] **Step 1: Get a Gemini API key**

Open https://aistudio.google.com/apikey → Create API key (free tier is fine for MVP).

- [ ] **Step 2: Add it to VPS `.env`**

Run (substitute `<KEY>`):
```bash
ssh root@72.62.116.92 "sudo -u alkinani bash -lc 'cd /home/alkinani/htdocs/alkinani.live && echo \"GEMINI_API_KEY=<KEY>\" >> .env && grep -c GEMINI_API_KEY .env'"
```
Expected: `1`.

- [ ] **Step 3: Restart PM2 so it picks the new var**

Run:
```bash
ssh root@72.62.116.92 "sudo -u alkinani bash -lc 'source ~/.nvm/nvm.sh && cd /home/alkinani/htdocs/alkinani.live && pm2 restart alkinani --update-env'"
```

---

## Phase 2 — Database & Helpers

### Task 3: Add jobs table

**Files:**
- Create: `server/turjuman/jobs-db.js`

- [ ] **Step 1: Write `jobs-db.js`**

```js
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
        output_srt_path = ?, completed_at = ?
      WHERE id = ?
    `),
    setJobError: db.prepare(`
      UPDATE turjuman_jobs SET status = 'error',
        error_message = ?, completed_at = ?
      WHERE id = ?
    `),
    chargeCredits: db.prepare(`
      UPDATE turjuman_users
      SET free_credits_remaining = MAX(0, free_credits_remaining - ?),
          credits_balance = MAX(0, credits_balance - GREATEST(0, ? - free_credits_remaining))
      WHERE id = ?
    `),
  };
}

export function createJob(q, userId, sourceUrl, targetLang) {
  const id = generateUserId(); // 16-char URL-safe
  q.insertJob.run(id, userId, sourceUrl, targetLang, Date.now());
  return q.findJob.get(id);
}
```

- [ ] **Step 2: Wire schema into `server.mjs`**

Add right after `ensureTurjumanSchema(db)`:
```js
import { ensureJobsSchema, makeJobsQueries } from "./turjuman/jobs-db.js";
ensureJobsSchema(db);
const turjumanJobsQueries = makeJobsQueries(db);
```

- [ ] **Step 3: Smoke**

```bash
cd ~/alkinani-site/server && PORT=3099 LEADERBOARD_DB=/tmp/jbsmoke.db node -e "
import('./server.mjs').then(() => {
  setTimeout(() => process.exit(0), 1000);
});
" 2>&1 | grep -i "alkinani-server" && rm -f /tmp/jbsmoke.db*
```
Expected: server starts, no errors.

- [ ] **Step 4: Commit**

```bash
cd ~/alkinani-site && git add server/turjuman/jobs-db.js server/server.mjs && git commit -m "feat(turjuman): jobs table + queries"
```

---

### Task 4: yt-dlp wrapper with SSRF guard

**Files:**
- Create: `server/turjuman/yt-dlp.js`

- [ ] **Step 1: Create `yt-dlp.js`**

```js
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import dns from "node:dns";

const lookup = promisify(dns.lookup);

const PRIVATE_RANGES = [
  /^10\./, /^127\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/, /^fe80:/i, /^fc00:/i, /^fd[0-9a-f]{2}:/i,
];

export async function validateUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { ok: false, error: "invalid_url" }; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "invalid_scheme" };
  }
  // SSRF: resolve hostname; reject private/loopback ranges.
  try {
    const { address } = await lookup(parsed.hostname);
    if (PRIVATE_RANGES.some((rx) => rx.test(address))) {
      return { ok: false, error: "private_ip_blocked" };
    }
  } catch {
    return { ok: false, error: "dns_resolve_failed" };
  }
  return { ok: true };
}

/**
 * Run yt-dlp to inspect a URL. Returns { duration, title, ext, filesize_mb }.
 * Does not download — just metadata.
 */
export function probe(url) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", [
      "--no-warnings", "--no-playlist", "--print-json", "--skip-download",
      "--socket-timeout", "20", url,
    ]);
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp probe failed: ${err.slice(0, 300)}`));
      try {
        const info = JSON.parse(out);
        resolve({
          duration: info.duration ?? null,
          title: info.title ?? "",
          ext: info.ext ?? "mp4",
          filesizeMb: info.filesize_approx ? Math.round(info.filesize_approx / 1e6) : null,
        });
      } catch (e) { reject(e); }
    });
  });
}

/**
 * Download video to `outPath`. Returns when ffprobe-friendly file exists.
 */
export function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", [
      "--no-warnings", "--no-playlist",
      "-f", "best[height<=720][ext=mp4]/best[ext=mp4]/best",
      "-o", outPath, "--socket-timeout", "20",
      "--retries", "3", url,
    ]);
    let err = "";
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp failed: ${err.slice(0, 300)}`));
      resolve();
    });
  });
}
```

- [ ] **Step 2: Smoke validateUrl**

```bash
cd ~/alkinani-site/server && node -e "
import('./turjuman/yt-dlp.js').then(async (m) => {
  console.log('youtube:', await m.validateUrl('https://youtube.com/watch?v=test'));
  console.log('localhost:', await m.validateUrl('http://localhost:3000'));
  console.log('169.254:', await m.validateUrl('http://169.254.169.254/'));
  console.log('ftp:', await m.validateUrl('ftp://example.com'));
});
"
```
Expected: youtube → ok:true, localhost → private_ip_blocked, 169.254 → private_ip_blocked, ftp → invalid_scheme.

- [ ] **Step 3: Commit**

```bash
cd ~/alkinani-site && git add server/turjuman/yt-dlp.js && git commit -m "feat(turjuman): yt-dlp wrapper + SSRF URL validation"
```

---

### Task 5: Gemini video-translation client

**Files:**
- Create: `server/turjuman/gemini.js`

- [ ] **Step 1: Create `gemini.js`**

```js
import fs from "node:fs/promises";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const PROMPT = (targetLang) => `
You are a professional subtitle translator.

Watch the attached video. Produce a JSON array of subtitle cues. Each cue
must have:
- "start": seconds, float, when the line starts
- "end": seconds, float, when the line ends
- "text": the spoken line translated into the target language

Target language: ${targetLang}
Language conventions:
- Arabic (ar): use Arabic script, Arabic punctuation (، and ؛), keep Arabic numerals (٠١٢٣).
  Use Modern Standard Arabic by default. Preserve Najdi/Hijazi flavor when source is Arabic.
- English (en): natural conversational English, sentence case, ASCII punctuation.
- Spanish (es): natural conversational Spanish.

Rules:
- Each cue ≤ 7 seconds.
- Each cue ≤ 84 characters of latin script OR ≤ 44 characters of Arabic.
- Break at natural sentence boundaries; do NOT break inside جار+مجرور or مضاف+إليه (Arabic).
- Preserve product/brand names verbatim (Postgres, OpenAI, etc.).
- Keep numbers, units, and proper nouns accurate.
- Mark non-speech audio as ♪ for music, (laughter) / (ضحك) for laughter.
- Output ONLY the JSON array. No prose, no markdown fences.
`.trim();

export async function translateVideo({ apiKey, videoBytes, mimeType, targetLang }) {
  if (!apiKey) throw new Error("missing_gemini_key");

  // 1. Upload video to Gemini Files API.
  const uploadUrl = `${API_BASE}/files?key=${apiKey}`;
  const form = new FormData();
  const blob = new Blob([videoBytes], { type: mimeType });
  form.append("file", blob, "video.mp4");
  form.append("metadata", JSON.stringify({ file: { display_name: "turjuman" } }));

  const uploadRes = await fetch(uploadUrl, { method: "POST", body: form });
  if (!uploadRes.ok) {
    throw new Error(`gemini_upload_failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const uploaded = await uploadRes.json();
  const fileUri = uploaded.file?.uri;
  if (!fileUri) throw new Error("gemini_upload_no_uri");

  // 2. generateContent with the file URI + prompt.
  const genUrl = `${API_BASE}/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
  const genBody = {
    contents: [{
      parts: [
        { text: PROMPT(targetLang) },
        { fileData: { mimeType, fileUri } },
      ],
    }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  };
  const genRes = await fetch(genUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(genBody),
  });
  if (!genRes.ok) {
    throw new Error(`gemini_gen_failed: ${genRes.status} ${await genRes.text()}`);
  }
  const data = await genRes.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("gemini_empty_response");

  return parseCues(text);
}

export function parseCues(text) {
  // Strip markdown fences if any leaked.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let arr;
  try { arr = JSON.parse(cleaned); } catch (e) {
    throw new Error(`gemini_json_parse: ${String(e).slice(0, 100)}; head=${cleaned.slice(0, 100)}`);
  }
  if (!Array.isArray(arr)) throw new Error("gemini_not_array");

  const cues = arr.filter((c) =>
    typeof c?.start === "number" &&
    typeof c?.end === "number" &&
    typeof c?.text === "string" &&
    c.end > c.start
  );
  if (cues.length === 0) throw new Error("gemini_no_cues");
  return cues;
}
```

- [ ] **Step 2: Test parser with golden fixture**

Create `server/turjuman/__tests__/gemini-parse.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCues } from "../gemini.js";

test("parseCues accepts valid JSON array", () => {
  const cues = parseCues('[{"start":0.0,"end":1.5,"text":"hi"},{"start":1.6,"end":3.0,"text":"there"}]');
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "hi");
});

test("parseCues strips markdown fence", () => {
  const cues = parseCues('```json\n[{"start":0,"end":1,"text":"x"}]\n```');
  assert.equal(cues[0].text, "x");
});

test("parseCues rejects malformed entries", () => {
  const cues = parseCues('[{"start":0,"end":1,"text":"ok"},{"text":"missing times"}]');
  assert.equal(cues.length, 1);
});

test("parseCues throws on no array", () => {
  assert.throws(() => parseCues('{"not":"array"}'), /gemini_not_array/);
});

test("parseCues throws when all entries invalid", () => {
  assert.throws(() => parseCues('[{"text":"only"}]'), /gemini_no_cues/);
});
```

Run:
```bash
cd ~/alkinani-site/server && node --test turjuman/__tests__/gemini-parse.test.js
```
Expected: 5 PASS.

- [ ] **Step 3: Commit**

```bash
cd ~/alkinani-site && git add server/turjuman/gemini.js server/turjuman/__tests__/gemini-parse.test.js && git commit -m "feat(turjuman): gemini 2.5 pro multimodal translation client + parser tests"
```

---

### Task 6: SRT formatter

**Files:**
- Create: `server/turjuman/srt.js`
- Create: `server/turjuman/__tests__/srt.test.js`

- [ ] **Step 1: Write failing test first**

Create `server/turjuman/__tests__/srt.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { cuesToSrt, formatTimestamp, splitLongLine } from "../srt.js";

test("formatTimestamp rounds to milliseconds", () => {
  assert.equal(formatTimestamp(0), "00:00:00,000");
  assert.equal(formatTimestamp(61.234), "00:01:01,234");
  assert.equal(formatTimestamp(3661.5), "01:01:01,500");
});

test("cuesToSrt produces standard SRT", () => {
  const cues = [
    { start: 0, end: 1.5, text: "hello" },
    { start: 1.6, end: 3.2, text: "world" },
  ];
  const srt = cuesToSrt(cues);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nhello\n\n2\n/);
});

test("splitLongLine breaks at 42 latin chars", () => {
  const s = "this is a fairly long subtitle line that exceeds forty-two characters by some amount";
  const lines = splitLongLine(s, 42);
  assert.ok(lines.length === 2);
  assert.ok(lines[0].length <= 42);
  assert.ok(lines[1].length <= 42);
});

test("splitLongLine breaks at 22 arabic chars", () => {
  const s = "هذي جملة طويلة جداً يجب كسرها بطريقة صحيحة";
  const lines = splitLongLine(s, 22);
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(l.length <= 22);
});

test("cuesToSrt enforces max 2 lines per cue", () => {
  const veryLong = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen";
  const srt = cuesToSrt([{ start: 0, end: 5, text: veryLong }]);
  const cueText = srt.split("\n").slice(2, -1).join("\n");
  assert.ok(cueText.split("\n").length <= 2, "cue exceeds 2 lines");
});
```

Run:
```bash
cd ~/alkinani-site/server && node --test turjuman/__tests__/srt.test.js
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 2: Implement `srt.js`**

```js
const ARABIC_RX = /[؀-ۿ]/;

export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n, w) { return String(n).padStart(w, "0"); }

function isArabic(text) {
  return ARABIC_RX.test(text);
}

/**
 * Greedy line-break: words are appended until adding one more would exceed
 * `maxChars`. The remainder starts a new line. Returns an array of lines.
 */
export function splitLongLine(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      // Word longer than the budget — hard break.
      if (w.length > maxChars) {
        let rest = w;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        line = rest;
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lay out a cue text into max-2-lines respecting char budget.
 * If the text needs >2 lines, the trailing lines are merged into the last
 * legal slot (truncation accepted — Plan B2 will improve this).
 */
function layoutCueText(text) {
  const maxChars = isArabic(text) ? 22 : 42;
  const lines = splitLongLine(text, maxChars);
  if (lines.length <= 2) return lines.join("\n");
  // Merge overflow into the second line (last-line truncation).
  return [lines[0], lines.slice(1).join(" ")].join("\n");
}

export function cuesToSrt(cues) {
  return cues
    .map((cue, i) => {
      const text = layoutCueText(cue.text.trim());
      return [
        String(i + 1),
        `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`,
        text,
        "",
      ].join("\n");
    })
    .join("\n");
}
```

- [ ] **Step 3: Verify tests pass**

```bash
cd ~/alkinani-site/server && node --test turjuman/__tests__/srt.test.js
```
Expected: 5 PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/alkinani-site && git add server/turjuman/srt.js server/turjuman/__tests__/srt.test.js && git commit -m "feat(turjuman): SRT formatter (timestamps + char budget + line breaks)"
```

---

## Phase 3 — Pipeline Worker

### Task 7: Pipeline orchestrator

**Files:**
- Create: `server/turjuman/pipeline.js`

- [ ] **Step 1: Create `pipeline.js`**

```js
import fs from "node:fs/promises";
import path from "node:path";
import { validateUrl, probe, download } from "./yt-dlp.js";
import { translateVideo } from "./gemini.js";
import { cuesToSrt } from "./srt.js";

const MAX_DURATION_SEC = 30 * 60; // Plan B Phase 1 limit (Section 12 of spec)
const MAX_FILESIZE_MB = 500;       // ceiling before Gemini upload

let _running = false;

/**
 * Cooperative single-job worker. Called from a setInterval. Returns quickly
 * if no queued job or if another tick is in flight.
 */
export async function tickWorker({ q, jobsRoot, geminiApiKey, log }) {
  if (_running) return;
  _running = true;
  try {
    const job = q.nextQueuedJob.get();
    if (!job) return;

    log(`[turjuman] picking up job ${job.id}`);
    const claim = q.setJobStarted.run(Date.now(), job.id);
    if (claim.changes !== 1) return; // somebody else grabbed it

    try {
      const srtPath = await runJob(job, jobsRoot, geminiApiKey, log);
      const meta = await fs.stat(srtPath);
      log(`[turjuman] job ${job.id} done · ${meta.size} bytes`);
      const minutes = Math.ceil((job.duration_seconds ?? 60) / 60);
      q.setJobDone.run(
        job.duration_seconds ?? null,
        minutes,
        srtPath,
        Date.now(),
        job.id
      );
      // Charge credits (free first, then paid)
      q.chargeCredits.run(minutes, minutes, job.user_id);
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

  // 1. SSRF guard (defense-in-depth — also enforced at API layer)
  const v = await validateUrl(job.source_url);
  if (!v.ok) throw new Error(`url_${v.error}`);

  // 2. Probe metadata
  const info = await probe(job.source_url);
  if (info.duration && info.duration > MAX_DURATION_SEC) {
    throw new Error(`too_long: ${Math.ceil(info.duration / 60)}min > ${MAX_DURATION_SEC / 60}min`);
  }
  if (info.filesizeMb && info.filesizeMb > MAX_FILESIZE_MB) {
    throw new Error(`too_large: ${info.filesizeMb}MB > ${MAX_FILESIZE_MB}MB`);
  }
  // store duration on job row for credit calc
  job.duration_seconds = info.duration ?? 0;

  // 3. Download
  log(`[turjuman] downloading ${job.id}…`);
  await download(job.source_url, videoPath);

  // 4. Read into memory + send to Gemini
  log(`[turjuman] translating ${job.id} via Gemini…`);
  const bytes = await fs.readFile(videoPath);
  const cues = await translateVideo({
    apiKey: geminiApiKey,
    videoBytes: bytes,
    mimeType: "video/mp4",
    targetLang: job.target_lang,
  });

  // 5. Format SRT + write
  const srt = cuesToSrt(cues);
  await fs.writeFile(srtPath, srt, "utf8");

  // 6. Cleanup source video to save disk
  await fs.unlink(videoPath).catch(() => {});

  return srtPath;
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/alkinani-site && git add server/turjuman/pipeline.js && git commit -m "feat(turjuman): pipeline orchestrator (SSRF guard + probe + download + Gemini + SRT write)"
```

---

### Task 8: Jobs routes + worker tick wiring

**Files:**
- Create: `server/turjuman/jobs-routes.js`
- Modify: `server/server.mjs`

- [ ] **Step 1: Create `jobs-routes.js`**

```js
import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { readSessionCookie } from "./auth.js";
import { readSession } from "./db.js";
import { createJob } from "./jobs-db.js";
import { validateUrl } from "./yt-dlp.js";

const ALLOWED_TARGETS = new Set(["ar", "en", "es"]);

export function jobsRouter({ q, jobsQ, jobsRoot }) {
  const router = express.Router();

  function authenticate(req, res, next) {
    const sid = readSessionCookie(req);
    if (!sid) return res.status(401).json({ error: "unauthenticated" });
    const session = readSession(q, sid);
    if (!session) return res.status(401).json({ error: "session_expired" });
    req.userId = session.user_id;
    next();
  }

  // POST /api/turjuman/jobs  { url, target_lang }
  router.post("/", authenticate, async (req, res) => {
    const url = (req.body?.url ?? "").trim();
    const target = (req.body?.target_lang ?? "ar").trim();
    if (!ALLOWED_TARGETS.has(target)) return res.status(400).json({ error: "invalid_target_lang" });

    const v = await validateUrl(url);
    if (!v.ok) return res.status(400).json({ error: `url_${v.error}` });

    // No credit pre-check yet — we charge after we know the duration.
    // Plan B2 will add a quota gate here.
    const job = createJob(jobsQ, req.userId, url, target);
    return res.json({ job });
  });

  // GET /api/turjuman/jobs
  router.get("/", authenticate, (req, res) => {
    const jobs = jobsQ.listUserJobs.all(req.userId);
    return res.json({ jobs });
  });

  // GET /api/turjuman/jobs/:id
  router.get("/:id", authenticate, (req, res) => {
    const job = jobsQ.findJob.get(req.params.id);
    if (!job) return res.status(404).json({ error: "not_found" });
    if (job.user_id !== req.userId) return res.status(404).json({ error: "not_found" });
    return res.json({ job });
  });

  // GET /api/turjuman/jobs/:id/srt
  router.get("/:id/srt", authenticate, async (req, res) => {
    const job = jobsQ.findJob.get(req.params.id);
    if (!job || job.user_id !== req.userId) return res.status(404).end();
    if (!job.output_srt_path) return res.status(409).json({ error: "not_ready" });
    try {
      const data = await fs.readFile(job.output_srt_path, "utf8");
      res.set("Content-Type", "application/x-subrip; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="turjuman-${job.id}.srt"`);
      return res.send(data);
    } catch {
      return res.status(410).json({ error: "expired" });
    }
  });

  return router;
}
```

- [ ] **Step 2: Wire into `server.mjs`**

Modify `server.mjs`:
```js
import { ensureJobsSchema, makeJobsQueries } from "./turjuman/jobs-db.js";
import { jobsRouter } from "./turjuman/jobs-routes.js";
import { tickWorker } from "./turjuman/pipeline.js";

// after ensureTurjumanSchema(db);
ensureJobsSchema(db);
const turjumanJobsQueries = makeJobsQueries(db);

const TURJUMAN_JOBS_ROOT = process.env.TURJUMAN_JOBS_ROOT
  ?? path.join(__dirname, "turjuman-jobs");
fs.mkdirSync(TURJUMAN_JOBS_ROOT, { recursive: true });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use("/api/turjuman/jobs",
  jobsRouter({ q: turjumanQueries, jobsQ: turjumanJobsQueries, jobsRoot: TURJUMAN_JOBS_ROOT })
);

// Worker tick every 5s — single in-flight job at a time (Plan B Phase 1)
setInterval(() => {
  tickWorker({
    q: turjumanJobsQueries,
    jobsRoot: TURJUMAN_JOBS_ROOT,
    geminiApiKey: GEMINI_API_KEY,
    log: (m) => console.log(m),
  }).catch((e) => console.error("[turjuman] tick error:", e));
}, 5000);
```

- [ ] **Step 3: Smoke (server starts cleanly)**

```bash
cd ~/alkinani-site/server && PORT=3099 LEADERBOARD_DB=/tmp/jbsmoke.db TURJUMAN_JOBS_ROOT=/tmp/jbjobs node server.mjs >/tmp/jbsrv.log 2>&1 &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:3099/api/chat/health -w " HTTP %{http_code}\n"
curl -s http://127.0.0.1:3099/api/turjuman/jobs -w " HTTP %{http_code}\n"
kill $SERVER_PID 2>/dev/null
wait 2>/dev/null
rm -rf /tmp/jbsmoke.db* /tmp/jbjobs /tmp/jbsrv.log
```
Expected: chat/health 200, jobs 401 (no auth).

- [ ] **Step 4: Commit**

```bash
cd ~/alkinani-site && git add server/turjuman/jobs-routes.js server/server.mjs && git commit -m "feat(turjuman): /api/turjuman/jobs/* + 5s worker tick"
```

---

## Phase 4 — Frontend Job UI

### Task 9: Extend client lib

**Files:**
- Modify: `src/lib/turjuman.ts`

- [ ] **Step 1: Add job-related functions to `src/lib/turjuman.ts`**

Add after the existing `logout` function:
```ts
export type JobStatus = "queued" | "processing" | "done" | "error";

export type Job = {
  id: string;
  user_id: string;
  source_url: string;
  target_lang: string;
  status: JobStatus;
  duration_seconds: number | null;
  credits_charged: number;
  error_message: string | null;
  output_srt_path: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
};

export async function createJob(url: string, targetLang: string): Promise<Job> {
  const data = await api<{ job: Job }>("/api/turjuman/jobs", {
    method: "POST",
    body: JSON.stringify({ url, target_lang: targetLang }),
  });
  return data.job;
}

export async function listJobs(): Promise<Job[]> {
  const data = await api<{ jobs: Job[] }>("/api/turjuman/jobs");
  return data.jobs;
}

export async function getJob(id: string): Promise<Job> {
  const data = await api<{ job: Job }>(`/api/turjuman/jobs/${id}`);
  return data.job;
}

export function srtDownloadUrl(id: string): string {
  return `/api/turjuman/jobs/${id}/srt`;
}

export function jobErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("url_invalid_url")) return "الرابط غير صالح.";
  if (msg.includes("url_invalid_scheme")) return "الرابط يجب أن يبدأ بـ https.";
  if (msg.includes("url_private_ip_blocked")) return "الرابط يشير لعنوان خاص.";
  if (msg.includes("url_dns_resolve_failed")) return "تعذر الوصول للرابط.";
  if (msg.includes("invalid_target_lang")) return "اللغة الهدف غير مدعومة.";
  if (msg.includes("unauthenticated") || msg.includes("session_expired"))
    return "انتهت الجلسة. سجّل الدخول مرة أخرى.";
  return "حدث خطأ. حاول مرة أخرى.";
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/alkinani-site && git add src/lib/turjuman.ts && git commit -m "feat(turjuman): client job API"
```

---

### Task 10: NewJob form + JobsList + JobRow

**Files:**
- Create: `src/components/turjuman/NewJob.tsx`
- Create: `src/components/turjuman/JobRow.tsx`
- Create: `src/components/turjuman/JobsList.tsx`

- [ ] **Step 1: `NewJob.tsx`**

```tsx
import { useState } from "react";
import { createJob, jobErrorMessage } from "../../lib/turjuman";

type Props = { onJobCreated: () => void };

const TARGETS = [
  { value: "ar", label: "عربي" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

export default function NewJob({ onJobCreated }: Props) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("ar");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createJob(url, target);
      setUrl("");
      onJobCreated();
    } catch (err) {
      setError(jobErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-ink-700/40 bg-ink-900/40 p-5">
      <h2 className="text-lg font-medium">ترجمة جديدة</h2>
      <input
        dir="ltr"
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="الصق رابط فيديو (YouTube, TikTok, Twitter, ...)"
        className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:border-ember-400 focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <label className="text-sm text-ink-300">لغة الترجمة:</label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-ink-100 focus:border-ember-400 focus:outline-none"
        >
          {TARGETS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting || !url}
          className="ms-auto rounded-lg bg-ember-400 px-5 py-2 font-medium text-ink-950 transition hover:bg-ember-300 disabled:opacity-50"
        >
          {submitting ? "..." : "ابدأ الترجمة"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: `JobRow.tsx`**

```tsx
import { srtDownloadUrl, type Job } from "../../lib/turjuman";

type Props = { job: Job };

const STATUS_LABELS: Record<Job["status"], string> = {
  queued: "في الطابور",
  processing: "تترجم الآن…",
  done: "جاهزة",
  error: "فشل",
};

const STATUS_COLORS: Record<Job["status"], string> = {
  queued: "text-ink-400",
  processing: "text-ember-400",
  done: "text-emerald-400",
  error: "text-rose-400",
};

export default function JobRow({ job }: Props) {
  const created = new Date(job.created_at).toLocaleString("ar");
  return (
    <div className="rounded-lg border border-ink-700/40 bg-ink-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            dir="ltr"
            className="truncate text-sm text-ink-300"
            title={job.source_url}
          >
            {job.source_url}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {created} · {job.target_lang}
            {job.duration_seconds ? ` · ${Math.ceil(job.duration_seconds / 60)}د` : ""}
          </p>
        </div>
        <span className={`shrink-0 text-xs ${STATUS_COLORS[job.status]}`}>
          {STATUS_LABELS[job.status]}
        </span>
      </div>
      {job.status === "done" && (
        <div className="mt-3 flex gap-2">
          <a
            href={srtDownloadUrl(job.id)}
            className="rounded-md border border-ember-400/40 bg-ember-400/10 px-3 py-1.5 text-xs text-ember-400 transition hover:bg-ember-400/20"
          >
            تحميل SRT
          </a>
        </div>
      )}
      {job.status === "error" && job.error_message && (
        <p className="mt-2 text-xs text-rose-400">{job.error_message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `JobsList.tsx`**

```tsx
import { useEffect, useState, useCallback } from "react";
import { listJobs, type Job } from "../../lib/turjuman";
import JobRow from "./JobRow";

export default function JobsList({ refreshNonce }: { refreshNonce: number }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await listJobs();
      setJobs(list);
    } catch {
      // surface in next refresh; ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Poll every 3s while any job is pending.
    const id = setInterval(() => {
      const pending = jobs.some(
        (j) => j.status === "queued" || j.status === "processing"
      );
      if (pending) void refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [refresh, jobs]);

  // Trigger refresh after a new job is created from NewJob.
  useEffect(() => {
    void refresh();
  }, [refreshNonce, refresh]);

  if (loading) return <p className="text-ink-400">جاري التحميل…</p>;
  if (jobs.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-ink-700/60 p-6 text-center text-ink-500">
        لا توجد ترجمات بعد. الصق رابط بالأعلى للبدء.
      </p>
    );

  return (
    <div className="space-y-2">
      {jobs.map((j) => <JobRow key={j.id} job={j} />)}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/alkinani-site && git add src/components/turjuman/NewJob.tsx src/components/turjuman/JobRow.tsx src/components/turjuman/JobsList.tsx && git commit -m "feat(turjuman): NewJob + JobsList + JobRow components"
```

---

### Task 11: Replace Dashboard placeholder body

**Files:**
- Modify: `src/components/turjuman/Dashboard.tsx`

- [ ] **Step 1: Replace the placeholder body block**

Replace the `<section>` block (the "ميزة الرفع تنزل قريباً" block) with:
```tsx
      <section className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <NewJob onJobCreated={() => setNonce((n) => n + 1)} />
        <div>
          <h2 className="mb-3 text-lg font-medium">ترجماتك</h2>
          <JobsList refreshNonce={nonce} />
        </div>
      </section>
```

Add at the top of the file:
```tsx
import { useState } from "react";
import NewJob from "./NewJob";
import JobsList from "./JobsList";
```

Add `const [nonce, setNonce] = useState(0);` to the component body.

- [ ] **Step 2: Verify build**

```bash
cd ~/alkinani-site && npm run build 2>&1 | tail -8
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ~/alkinani-site && git add src/components/turjuman/Dashboard.tsx && git commit -m "feat(turjuman): wire NewJob + JobsList into Dashboard"
```

---

## Phase 5 — Deploy & Live Verify

### Task 12: Deploy

**Files:** none

- [ ] **Step 1: Deploy**

```bash
cd ~/alkinani-site && bash scripts/deploy-all.sh --skip-pages
```
Wait for `→ verifying parity…`. Then check PM2:

```bash
ssh root@72.62.116.92 "sudo -u alkinani bash -lc 'source ~/.nvm/nvm.sh && pm2 logs alkinani --lines 10 --nostream'" | tail -20
```
Expected: `alkinani-server listening on 127.0.0.1:3002` and no errors.

---

### Task 13: Live smoke test

**Files:** none

- [ ] **Step 1: Sign in as yourself**

Open `https://alkinani.live/tools/turjuman`. Submit your real email. Wait for the magic-link email. Click → land on Dashboard.

> If RESEND_API_KEY is not set on the VPS yet: get the link from server logs:
> `ssh root@72.62.116.92 "sudo -u alkinani bash -lc 'source ~/.nvm/nvm.sh && pm2 logs alkinani --lines 30 --nostream | grep email-dev'"`

- [ ] **Step 2: Submit a 1-min YouTube clip for translation to Arabic**

Paste a short YouTube URL (e.g. a 30-60s clip) → "ابدأ الترجمة".
Watch the row appear → "في الطابور" → "تترجم الآن…" → "جاهزة" within ~60-120s.

- [ ] **Step 3: Download + verify SRT**

Click "تحميل SRT". Open the file. Confirm:
- Standard SRT format (`1`, timestamp, text, blank line)
- Arabic translation present and looks coherent
- Timestamps roughly match the video
- No characters > 22 per Arabic line

- [ ] **Step 4: Try a known-bad URL (smoke error path)**

Submit `http://127.0.0.1:80/foo` → expect immediate "الرابط يشير لعنوان خاص."

- [ ] **Step 5: Tag**

```bash
cd ~/alkinani-site && git tag -a turjuman-pipeline-mvp -m "Plan B Phase 1: URL → translated SRT MVP"
```

---

## Acceptance Criteria

- [ ] Logged-in user pastes any public YouTube URL ≤ 30 minutes, ≤ 500MB
- [ ] Job appears in JobsList within 1s of submission
- [ ] Job transitions queued → processing → done autonomously
- [ ] SRT downloads successfully and is RFC-3339 SubRip compliant
- [ ] Arabic line breaks respect ≤ 22 char budget, max 2 lines per cue
- [ ] SSRF: `http://127.0.0.1` and `http://169.254.169.254` rejected with friendly message
- [ ] Wrong-protocol URL (ftp://, file://) rejected
- [ ] Other users cannot see your jobs (`GET /api/turjuman/jobs/<your-id>` from another session → 404)
- [ ] `node --test server/turjuman/__tests__/*.test.js` passes (5 SRT + 5 Gemini-parse tests)

---

## Out of Scope (Plan B2 follow-ups)

- File upload (no-URL path)
- Burned-MP4 output via ffmpeg
- Interactive player with seek + edit
- Concurrency > 1 job (Phase 1 worker is strict serial)
- Long path (Scribe + Claude) for >5min videos — Phase 1 sends everything to Gemini multimodal
- Quota gating (free 10-min/month) — Phase 1 charges credits AFTER processing; refunds easy via setJobError
- Discourse smoother + back-translation drift check
- Mobile bottom-sheet for jobs list
- Storage limits / retention prune (manual for v1)
