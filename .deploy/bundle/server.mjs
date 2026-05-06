// Alkinani Live — Express server
// Serves static dist + ports the 5 CF Pages Functions to Node + leaderboard.
//
// Endpoints:
//   GET  /api/chat/health       — health probe
//   POST /api/chat              — SSE streaming chat (Najdi voice)
//   POST /api/profile           — Reflex Lab founder reading
//   POST /api/idea              — Bithrah Lens idea evaluator
//   POST /api/pressure          — Pitch pressure (critique + verdict)
//   GET  /api/tts               — TTS configured probe
//   POST /api/tts               — TTS audio (ElevenLabs or keyless gTTS)
//   GET  /api/leaderboard       — public top scores (?game=sprint&limit=20)
//   POST /api/leaderboard       — submit score {game, name, score, meta?}
//
// Env (optional):
//   PORT                       default 3002
//   ANTHROPIC_API_KEY          unlock Claude (else 503 with friendly msg)
//   ANTHROPIC_MODEL            default claude-sonnet-4-5
//   ELEVENLABS_API_KEY         premium TTS (else gTTS keyless)
//   ELEVENLABS_VOICE_AR / _EN / ELEVENLABS_MODEL
//   STATIC_DIR                 default ./public
//   LEADERBOARD_DB             default ./leaderboard.db

import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3002", 10);
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.join(__dirname, "public");
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const DB_PATH = process.env.LEADERBOARD_DB || path.join(__dirname, "leaderboard.db");

// Load prompt files lazily once.
const promptDir = path.join(__dirname, "prompts");
const PROMPTS = {
  chat: fs.readFileSync(path.join(promptDir, "chat.txt"), "utf8"),
  profile_ar: fs.readFileSync(path.join(promptDir, "profile_ar.txt"), "utf8"),
  profile_en: fs.readFileSync(path.join(promptDir, "profile_en.txt"), "utf8"),
  idea: fs.readFileSync(path.join(promptDir, "idea.txt"), "utf8"),
  pressure_critic: fs.readFileSync(path.join(promptDir, "pressure_critic.txt"), "utf8"),
  pressure_judge: fs.readFileSync(path.join(promptDir, "pressure_judge.txt"), "utf8"),
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

// CORS — same-origin in production, but keep permissive for dev tools.
app.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("/api/*", (_req, res) => res.sendStatus(204));

/* -------------------------- Helpers -------------------------- */

function jsonError(res, msg, status = 400) {
  return res.status(status).json({ error: msg });
}

function safeJson(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try { return JSON.parse(slice); } catch {}
  const repaired = slice
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\}\)\s*,/g, "},")
    .replace(/\)\s*,\s*"/g, ',"');
  try { return JSON.parse(repaired); } catch {}
  for (let i = 1; i <= 6; i++) {
    try { return JSON.parse(repaired + "}".repeat(i)); } catch {}
  }
  return null;
}

// Non-streaming Claude call returning text.
async function claudeText(system, userMsg, maxTokens = 700) {
  if (!ANTHROPIC_KEY) throw new Error("anthropic_key_missing");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`anthropic_${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const blocks = j.content || [];
  return blocks.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

/* -------------------------- /api/chat (SSE) -------------------------- */

app.get("/api/chat/health", (_req, res) => {
  res.json({ ok: true, backend: ANTHROPIC_KEY ? "anthropic" : "none" });
});

app.post("/api/chat", async (req, res) => {
  const messages = (req.body?.messages || []).slice(-12);
  if (!Array.isArray(messages) || !messages.length) {
    return jsonError(res, "messages[] required", 400);
  }

  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const send = (event, payload) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  if (!ANTHROPIC_KEY) {
    send("delta", {
      delta:
        "النظام شغّال — بس مفتاح الـAI ما هو متربط بعد. بإمكانك تواصلني على واتساب +966 59 998 8522.",
    });
    send("done", { reason: "no_key" });
    return res.end();
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
        stream: true,
        system: PROMPTS.chat,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "");
      send("error", { error: `anthropic ${upstream.status}: ${t.slice(0, 200)}` });
      return res.end();
    }

    // Parse Anthropic SSE → emit our protocol.
    const decoder = new TextDecoder();
    let buf = "";
    let evt = "";
    for await (const chunk of upstream.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          evt = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const p = JSON.parse(data);
            if (evt === "content_block_delta" && p?.delta?.type === "text_delta") {
              const text = p.delta.text || "";
              if (text) send("delta", { delta: text });
            }
          } catch {}
        }
      }
    }
    send("done", { reason: "done" });
    res.end();
  } catch (err) {
    send("error", { error: String(err) });
    res.end();
  }
});

/* -------------------------- /api/profile -------------------------- */

function profileFallback(lang) {
  if (lang === "ar") {
    return {
      archetype: "المؤسس المختلط",
      headline: "تحركاتك متوازنة، بدون نمط واضح بعد.",
      traits: ["متوازن", "حذر", "مرن"],
      insight: "اختياراتك ما رجّحت محور واحد. هذا يعني فضول صحي بس صعب يبني هوية.",
      blindspot: "صعب ترسل رسالة قوية للسوق وأنت بدون انحياز واضح.",
      prescription: "اختار محور واحد لشهر — مثال: السرعة فقط — وقرراتك كلها تكون له.",
    };
  }
  return {
    archetype: "the balanced one",
    headline: "your moves are even, no dominant axis yet.",
    traits: ["balanced", "cautious", "flexible"],
    insight: "your picks didn't lean hard on any axis. healthy curiosity, but hard to build identity.",
    blindspot: "without a clear bias it's hard to send a sharp signal to market.",
    prescription: "pick one axis for one month — say, speed only — and force every decision through it.",
  };
}

app.post("/api/profile", async (req, res) => {
  const lang = req.body?.lang === "en" ? "en" : "ar";
  const picks = Array.isArray(req.body?.picks) ? req.body.picks.slice(0, 12) : [];
  const leans = req.body?.leans || {};
  if (!picks.length) return jsonError(res, "picks required", 400);

  const userMsg = lang === "ar"
    ? `قراراتك السبعة:\n${picks.map((p, i) => `${i + 1}. ${p.prompt}\n   اخترت: ${p.choice}  (axis=${p.axis}, side=${p.side})`).join("\n")}\n\nالميل بالمحاور: ${JSON.stringify(leans)}\n\nاكتب القراءة.`
    : `your 7 picks:\n${picks.map((p, i) => `${i + 1}. ${p.prompt}\n   chose: ${p.choice}  (axis=${p.axis}, side=${p.side})`).join("\n")}\n\nlean per axis: ${JSON.stringify(leans)}\n\nwrite the reading.`;

  if (!ANTHROPIC_KEY) return res.json(profileFallback(lang));

  try {
    const raw = await claudeText(lang === "ar" ? PROMPTS.profile_ar : PROMPTS.profile_en, userMsg, 700);
    const parsed = safeJson(raw);
    if (parsed && typeof parsed === "object" && "archetype" in parsed) return res.json(parsed);
    return res.json(profileFallback(lang));
  } catch {
    return res.json(profileFallback(lang));
  }
});

/* -------------------------- /api/idea -------------------------- */

function ideaFallback(idea, raw = "") {
  const isAr = /[؀-ۿ]/.test(idea);
  return {
    lang: isAr ? "ar" : "en",
    scores: {
      market: { value: 5, reason: isAr ? "ما قدر النظام يقدّر السوق." : "Could not estimate market." },
      unique: { value: 5, reason: isAr ? "ما قدر النظام يقدّر التميز." : "Could not estimate uniqueness." },
      execution: { value: 5, reason: isAr ? "ما قدر النظام يقدّر التنفيذ." : "Could not estimate execution." },
    },
    summary: raw.slice(0, 280) || (isAr ? "حاول صياغة فكرتك بشكل أوضح." : "Try a clearer description of the idea."),
    recommendation: isAr
      ? "اكتب الفكرة بسطرين: مين الزبون، إيش المشكلة الي تحلها، وكيف ستخدم منها فلوس."
      : "Rewrite the idea in two lines: who the customer is, what pain you solve, and how you make money.",
    references: [],
  };
}

app.post("/api/idea", async (req, res) => {
  const idea = String(req.body?.idea || "").trim();
  if (!idea) return jsonError(res, "idea required", 400);
  if (idea.length > 600) return jsonError(res, "idea too long (max 600)", 400);
  if (!ANTHROPIC_KEY) return res.json(ideaFallback(idea));

  try {
    const raw = await claudeText(PROMPTS.idea, idea, 2200);
    const parsed = safeJson(raw);
    if (parsed && typeof parsed === "object" && "scores" in parsed) return res.json(parsed);
    return res.json(ideaFallback(idea, raw));
  } catch (e) {
    return res.json(ideaFallback(idea, String(e).slice(0, 80)));
  }
});

/* -------------------------- /api/pressure -------------------------- */

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function gradeFromScore(n) {
  if (n >= 91) return "A+";
  if (n >= 81) return "A";
  if (n >= 71) return "B+";
  if (n >= 61) return "B";
  if (n >= 51) return "C";
  if (n >= 31) return "D";
  return "F";
}

app.post("/api/pressure", async (req, res) => {
  const body = req.body || {};
  if (body.phase === "critique") {
    const idea = String(body.idea || "").trim();
    if (!idea) return jsonError(res, "idea required", 400);
    if (idea.length > 600) return jsonError(res, "idea too long", 400);
    const isAr = /[؀-ۿ]/.test(idea);
    if (!ANTHROPIC_KEY) {
      return res.json({
        critique: isAr
          ? "ما تركت مساحة لاعتراض محدد. أعد صياغة الفكرة بشكل أوضح."
          : "your idea is too vague to attack. say what you sell, who buys, and why now.",
      });
    }
    try {
      const critique = await claudeText(PROMPTS.pressure_critic, idea, 220);
      return res.json({
        critique: critique || (isAr
          ? "ما تركت مساحة لاعتراض محدد. أعد صياغة الفكرة بشكل أوضح."
          : "your idea is too vague to attack. say what you sell, who buys, and why now."),
      });
    } catch (e) {
      return jsonError(res, `ai error: ${String(e).slice(0, 80)}`, 502);
    }
  }

  if (body.phase === "verdict") {
    const { idea, critique, rebuttal } = body;
    if (!idea?.trim() || !critique?.trim() || !rebuttal?.trim()) {
      return jsonError(res, "idea, critique, and rebuttal all required", 400);
    }
    const isAr = /[؀-ۿ]/.test(idea);
    const userMsg = isAr
      ? `الفكرة: ${idea}\n\nالاعتراض: ${critique}\n\nرد المؤسس: ${rebuttal}\n\nاحكم.`
      : `Idea: ${idea}\n\nObjection: ${critique}\n\nFounder rebuttal: ${rebuttal}\n\nJudge.`;

    if (!ANTHROPIC_KEY) {
      return res.json({
        score: 50, grade: "C",
        verdict: isAr ? "ما قدر النظام يحكم. جرب إجابة أوضح." : "Couldn't judge. Try a sharper rebuttal.",
        ali: isAr
          ? "الجواب القوي يجيب رقم محدد ويربطه بالاعتراض مباشرة."
          : "A strong answer brings one specific number and ties it directly to the objection.",
      });
    }

    try {
      const raw = await claudeText(PROMPTS.pressure_judge, userMsg, 400);
      const parsed = safeJson(raw);
      if (!parsed || typeof parsed.score !== "number") {
        return res.json({
          score: 50, grade: "C",
          verdict: isAr ? "ما قدر النظام يحكم. جرب إجابة أوضح." : "Couldn't judge. Try a sharper rebuttal.",
          ali: isAr
            ? "الجواب القوي يجيب رقم محدد ويربطه بالاعتراض مباشرة."
            : "A strong answer brings one specific number and ties it directly to the objection.",
        });
      }
      return res.json({
        score: clamp(Math.round(parsed.score), 0, 100),
        grade: parsed.grade || gradeFromScore(parsed.score),
        verdict: parsed.verdict || "",
        ali: parsed.ali || "",
      });
    } catch (e) {
      return jsonError(res, `ai error: ${String(e).slice(0, 80)}`, 502);
    }
  }

  return jsonError(res, "unknown phase", 400);
});

/* -------------------------- /api/tts -------------------------- */

app.get("/api/tts", (_req, res) => res.json({ ok: true, configured: true }));

const ELEVEN_DEFAULT_VOICE = "ErXwobaYiN019PkySvjV";
const ELEVEN_DEFAULT_MODEL = "eleven_multilingual_v2";

async function elevenLabsTTS(res, text, lang) {
  const voiceId = (lang === "ar" ? process.env.ELEVENLABS_VOICE_AR : process.env.ELEVENLABS_VOICE_EN) || ELEVEN_DEFAULT_VOICE;
  const model = process.env.ELEVENLABS_MODEL || ELEVEN_DEFAULT_MODEL;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?optimize_streaming_latency=2&output_format=mp3_44100_128`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text, model_id: model,
      voice_settings: { stability: 0.45, similarity_boost: 0.78, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return jsonError(res, `elevenlabs ${r.status}: ${t.slice(0, 200)}`, 502);
  }
  res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400, immutable" });
  for await (const chunk of r.body) res.write(chunk);
  res.end();
}

function chunkText(t, maxLen) {
  if (t.length <= maxLen) return [t];
  const re = /[^.!?؟،,\n]+[.!?؟،,\n]?/g;
  const parts = [];
  let m;
  while ((m = re.exec(t)) !== null) { const s = m[0].trim(); if (s) parts.push(s); }
  const out = []; let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length <= maxLen) cur = (cur + " " + p).trim();
    else {
      if (cur) out.push(cur);
      if (p.length <= maxLen) cur = p;
      else {
        const words = p.split(/\s+/); let w = "";
        for (const word of words) {
          if ((w + " " + word).trim().length <= maxLen) w = (w + " " + word).trim();
          else { if (w) out.push(w); w = word; }
        }
        if (w) out.push(w); cur = "";
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function gTTS(text, lang) {
  const tl = lang === "ar" ? "ar" : "en";
  const chunks = chunkText(text, 180);
  const bufs = [];
  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i];
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8` +
      `&q=${encodeURIComponent(part)}&tl=${tl}&total=${chunks.length}` +
      `&idx=${i}&textlen=${part.length}&client=tw-ob`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!r.ok) throw new Error(`gtts ${r.status} on chunk ${i + 1}`);
    bufs.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(bufs);
}

app.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return jsonError(res, "text required", 400);
  if (text.length > 1500) return jsonError(res, "text too long (max 1500 chars)", 400);
  const lang = req.body?.lang === "en" ? "en" : "ar";

  if (ELEVEN_KEY) return elevenLabsTTS(res, text, lang);

  try {
    const audio = await gTTS(text, lang);
    res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400, immutable" });
    res.send(audio);
  } catch (e) {
    return jsonError(res, `tts failed: ${String(e).slice(0, 200)}`, 502);
  }
});

/* -------------------------- /api/leaderboard -------------------------- */

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game        TEXT NOT NULL,
    name        TEXT NOT NULL,
    score       INTEGER NOT NULL,
    meta        TEXT,
    ip_hash     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_scores_game_score
    ON scores(game, score DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_scores_iphash_created
    ON scores(ip_hash, created_at DESC);
`);

const VALID_GAMES = new Set(["sprint", "reflex", "pressure"]);
// Per-game caps to short-circuit obvious cheats. Tune as the games evolve.
const GAME_MAX = { sprint: 2000, reflex: 100, pressure: 100 };

const insertScore = db.prepare(
  "INSERT INTO scores (game, name, score, meta, ip_hash) VALUES (?, ?, ?, ?, ?)"
);
const topScoresStmt = db.prepare(
  // Top distinct (name, score) per game - keep ALL submissions but the leaderboard
  // shows the BEST score per name to discourage spam.
  `SELECT name, MAX(score) AS score, MAX(created_at) AS created_at, MAX(meta) AS meta
   FROM scores
   WHERE game = ?
   GROUP BY name
   ORDER BY score DESC, created_at ASC
   LIMIT ?`
);
const totalSubmissionsStmt = db.prepare("SELECT COUNT(*) AS n FROM scores WHERE game = ?");
const recentByIpStmt = db.prepare(
  "SELECT created_at FROM scores WHERE ip_hash = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1"
);
const rankStmt = db.prepare(
  // Rank a candidate score within a game (1-based; 1 = best).
  `SELECT 1 + COUNT(*) AS rank FROM (
    SELECT MAX(score) AS s FROM scores WHERE game = ? GROUP BY name
  ) WHERE s > ?`
);

function hashIP(req) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  // Salt with the DB path so hashes aren't reversible across deploys, but stable per server.
  return crypto.createHash("sha256").update(ip + "|" + DB_PATH).digest("hex").slice(0, 16);
}

function sanitizeName(raw) {
  if (typeof raw !== "string") return null;
  // Strip control chars, trim, collapse whitespace, cap length.
  let n = raw.replace(/[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim();
  if (!n) return null;
  if (n.length > 30) n = n.slice(0, 30);
  // Disallow URLs / @-handles to keep names clean (no link-spam).
  if (/https?:\/\//i.test(n) || /(^|\s)@\w/.test(n)) return null;
  return n;
}

app.get("/api/leaderboard", (req, res) => {
  const game = String(req.query?.game || "sprint").toLowerCase();
  if (!VALID_GAMES.has(game)) return jsonError(res, "unknown game", 400);
  const limit = Math.min(Math.max(parseInt(req.query?.limit || "10", 10) || 10, 1), 50);
  const rows = topScoresStmt.all(game, limit).map((r) => ({
    name: r.name,
    score: r.score,
    createdAt: r.created_at,
    meta: r.meta ? safeJson(r.meta) : null,
  }));
  const total = totalSubmissionsStmt.get(game).n;
  res.set("Cache-Control", "public, max-age=10");
  res.json({ game, total, top: rows });
});

app.post("/api/leaderboard", (req, res) => {
  const body = req.body || {};
  const game = String(body.game || "").toLowerCase();
  if (!VALID_GAMES.has(game)) return jsonError(res, "unknown game", 400);

  const name = sanitizeName(body.name);
  if (!name) return jsonError(res, "name required (1-30 chars, no urls/handles)", 400);

  const score = Number(body.score);
  if (!Number.isFinite(score) || !Number.isInteger(score)) {
    return jsonError(res, "score must be an integer", 400);
  }
  const cap = GAME_MAX[game] ?? 10000;
  if (score < -100 || score > cap) {
    return jsonError(res, `score out of range for ${game}`, 400);
  }

  // Rate limit: 1 submission per IP per 15 seconds (prevents accidental double-tap + basic spam).
  const ipHash = hashIP(req);
  const recent = recentByIpStmt.get(ipHash, Date.now() - 15_000);
  if (recent) return jsonError(res, "slow down — try again in a few seconds", 429);

  // Optional meta: stash the run breakdown (correct/wrong/streak/etc).
  let metaStr = null;
  if (body.meta && typeof body.meta === "object") {
    try {
      metaStr = JSON.stringify(body.meta).slice(0, 1000);
    } catch { metaStr = null; }
  }

  insertScore.run(game, name, score, metaStr, ipHash);
  const rank = rankStmt.get(game, score).rank;
  const total = totalSubmissionsStmt.get(game).n;
  res.json({ ok: true, game, name, score, rank, total });
});

/* -------------------------- Static + SPA fallback -------------------------- */

app.use(express.static(STATIC_DIR, {
  extensions: ["html"],
  maxAge: "1h",
  setHeaders(res, file) {
    if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  },
}));

// SPA fallback — anything that's not /api and not a real file → index.html
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  const indexFile = path.join(STATIC_DIR, "index.html");
  fs.access(indexFile, fs.constants.R_OK, (err) => {
    if (err) return next();
    res.sendFile(indexFile);
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`alkinani-server listening on 127.0.0.1:${PORT}`);
  console.log(`  static: ${STATIC_DIR}`);
  console.log(`  anthropic: ${ANTHROPIC_KEY ? "configured" : "MISSING (will fallback)"}`);
  console.log(`  elevenlabs: ${ELEVEN_KEY ? "configured" : "missing (using gTTS)"}`);
  console.log(`  leaderboard db: ${DB_PATH}`);
});
