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
import rateLimit from "express-rate-limit";
import { ensureSchema as ensureTurjumanSchema, makeQueries as makeTurjumanQueries, prune as pruneTurjuman } from "./turjuman/db.js";
import { turjumanRouter } from "./turjuman/routes.js";
import { ensureJobsSchema as ensureTurjumanJobsSchema, makeJobsQueries as makeTurjumanJobsQueries } from "./turjuman/jobs-db.js";
import { jobsRouter as turjumanJobsRouter } from "./turjuman/jobs-routes.js";
import { tickWorker as tickTurjumanWorker } from "./turjuman/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3002", 10);
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.join(__dirname, "public");
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const KIMI_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
// kimi-k2.6 = reasoning model (fills reasoning_content first, then content).
// Slower than turbo but voice is markedly more natural — uses real discourse
// markers (والله، اقولك، شف) and varies sentence shape. The reasoning step
// also catches dumb answers before they leave the model.
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2.6";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const DB_PATH = process.env.LEADERBOARD_DB || path.join(__dirname, "leaderboard.db");

// Backend selection — prefer Anthropic if both are present (highest Najdi
// quality), else Kimi K2 (256K context, OpenAI-compatible, cheap), else
// graceful fallback message.
const AI_BACKEND = ANTHROPIC_KEY ? "anthropic" : KIMI_KEY ? "kimi" : "none";

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
// Trust the loopback so X-Forwarded-For from the local nginx is honored,
// without trusting headers from arbitrary clients (per pentest finding —
// `cf-connecting-ip` / `x-real-ip` were spoofable end-to-end).
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "256kb" }));

// CORS — only our origins. Pentest F6 found `*` allowed any third-party
// site to burn AI/TTS budget via the visitor's session.
const ALLOWED_ORIGINS = new Set([
  "https://alkinani.live",
  "https://www.alkinani.live",
  "https://alkinani-site.pages.dev",
  "http://localhost:5173",  // vite dev
  "http://localhost:3002",
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Radar-Secret");
  next();
});
app.options("/api/*", (_req, res) => res.sendStatus(204));

// Rate limits — pentest A6/F7 found unbounded /api/chat + /api/tts could
// drain Anthropic/Kimi/ElevenLabs budget. These caps assume real users
// burst at human speed; bots get 429 quickly.
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,           // 5 minutes
  max: 30,                           // 30 chat msgs / 5 min / IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many requests, slow down for a sec." },
});
const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,               // 1 minute
  max: 10,                           // 10 tts calls / minute / IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TTS rate limit reached, try again in a minute." },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

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

// Non-streaming Kimi (OpenAI-compatible chat-completions) returning text.
async function kimiText(system, userMsg, maxTokens = 700) {
  if (!KIMI_KEY) throw new Error("kimi_key_missing");
  const r = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KIMI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      max_tokens: maxTokens,
      temperature: 0.55,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`kimi_${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || "").trim();
}

// Unified text call — picks Anthropic or Kimi automatically.
async function aiText(system, userMsg, maxTokens = 700) {
  if (AI_BACKEND === "anthropic") return claudeText(system, userMsg, maxTokens);
  if (AI_BACKEND === "kimi") return kimiText(system, userMsg, maxTokens);
  throw new Error("no_ai_backend");
}

/* -------------------------- /api/chat (SSE) -------------------------- */

app.get("/api/chat/health", (_req, res) => {
  res.json({ ok: true, backend: AI_BACKEND });
});

// Stream Anthropic SSE → our protocol.
async function streamAnthropic(messages, send) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      temperature: 0.6,
      stream: true,
      system: PROMPTS.chat,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    send("error", { error: `anthropic ${upstream.status}: ${t.slice(0, 200)}` });
    return;
  }
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
}

// Stream Kimi (OpenAI-compatible SSE) → our protocol.
async function streamKimi(messages, send) {
  const upstream = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KIMI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      max_tokens: 900,
      temperature: 0.78,      // higher = more discourse markers, less robotic
      top_p: 0.92,
      // kimi-k2.6 rejects frequency_penalty/presence_penalty (HTTP 400).
      stream: true,
      messages: [
        { role: "system", content: PROMPTS.chat },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    send("error", { error: `kimi ${upstream.status}: ${t.slice(0, 200)}` });
    return;
  }
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of upstream.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const p = JSON.parse(data);
        const delta = p?.choices?.[0]?.delta?.content || "";
        if (delta) send("delta", { delta });
      } catch {}
    }
  }
}

app.post("/api/chat", chatLimiter, async (req, res) => {
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

  if (AI_BACKEND === "none") {
    send("delta", {
      delta:
        "النظام شغّال — بس مفتاح الـAI ما هو متربط بعد. بإمكانك تواصلني على واتساب +966 59 998 8522.",
    });
    send("done", { reason: "no_key" });
    return res.end();
  }

  try {
    if (AI_BACKEND === "anthropic") await streamAnthropic(messages, send);
    else if (AI_BACKEND === "kimi") await streamKimi(messages, send);
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

app.post("/api/profile", writeLimiter, async (req, res) => {
  const lang = req.body?.lang === "en" ? "en" : "ar";
  const picks = Array.isArray(req.body?.picks) ? req.body.picks.slice(0, 12) : [];
  const leans = req.body?.leans || {};
  if (!picks.length) return jsonError(res, "picks required", 400);

  const userMsg = lang === "ar"
    ? `قراراتك السبعة:\n${picks.map((p, i) => `${i + 1}. ${p.prompt}\n   اخترت: ${p.choice}  (axis=${p.axis}, side=${p.side})`).join("\n")}\n\nالميل بالمحاور: ${JSON.stringify(leans)}\n\nاكتب القراءة.`
    : `your 7 picks:\n${picks.map((p, i) => `${i + 1}. ${p.prompt}\n   chose: ${p.choice}  (axis=${p.axis}, side=${p.side})`).join("\n")}\n\nlean per axis: ${JSON.stringify(leans)}\n\nwrite the reading.`;

  if (AI_BACKEND === "none") return res.json(profileFallback(lang));

  try {
    const raw = await aiText(lang === "ar" ? PROMPTS.profile_ar : PROMPTS.profile_en, userMsg, 700);
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

app.post("/api/idea", writeLimiter, async (req, res) => {
  const idea = String(req.body?.idea || "").trim();
  if (!idea) return jsonError(res, "idea required", 400);
  if (idea.length > 600) return jsonError(res, "idea too long (max 600)", 400);
  if (AI_BACKEND === "none") return res.json(ideaFallback(idea));

  try {
    const raw = await aiText(PROMPTS.idea, idea, 2200);
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

app.post("/api/pressure", writeLimiter, async (req, res) => {
  const body = req.body || {};
  if (body.phase === "critique") {
    const idea = String(body.idea || "").trim();
    if (!idea) return jsonError(res, "idea required", 400);
    if (idea.length > 600) return jsonError(res, "idea too long", 400);
    const isAr = /[؀-ۿ]/.test(idea);
    if (AI_BACKEND === "none") {
      return res.json({
        critique: isAr
          ? "ما تركت مساحة لاعتراض محدد. أعد صياغة الفكرة بشكل أوضح."
          : "your idea is too vague to attack. say what you sell, who buys, and why now.",
      });
    }
    try {
      const critique = await aiText(PROMPTS.pressure_critic, idea, 220);
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

    if (AI_BACKEND === "none") {
      return res.json({
        score: 50, grade: "C",
        verdict: isAr ? "ما قدر النظام يحكم. جرب إجابة أوضح." : "Couldn't judge. Try a sharper rebuttal.",
        ali: isAr
          ? "الجواب القوي يجيب رقم محدد ويربطه بالاعتراض مباشرة."
          : "A strong answer brings one specific number and ties it directly to the objection.",
      });
    }

    try {
      const raw = await aiText(PROMPTS.pressure_judge, userMsg, 400);
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

app.post("/api/tts", ttsLimiter, async (req, res) => {
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
    country     TEXT,
    ip_hash     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_scores_game_score
    ON scores(game, score DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_scores_iphash_created
    ON scores(ip_hash, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_scores_game_created
    ON scores(game, created_at DESC);
`);
// Add `country` column to existing tables (no-op if already there).
try { db.exec("ALTER TABLE scores ADD COLUMN country TEXT"); } catch {}

/* -------------------------- /api/turjuman/* -------------------------- */

ensureTurjumanSchema(db);
const turjumanQueries = makeTurjumanQueries(db);

const TURJUMAN_BASE_URL = process.env.TURJUMAN_BASE_URL ||
  (process.env.NODE_ENV === "production" ? "https://alkinani.live" : "http://localhost:3002");
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "noreply@alkinani.live";

app.use("/api/turjuman", turjumanRouter({
  q: turjumanQueries,
  resendApiKey: RESEND_API_KEY,
  resendFrom: RESEND_FROM,
  baseUrl: TURJUMAN_BASE_URL,
  isProduction: process.env.NODE_ENV === "production",
}));

// Hourly prune of expired tokens + sessions.
setInterval(() => {
  try { pruneTurjuman(turjumanQueries); } catch (e) {
    console.warn("[turjuman] prune failed:", e?.message ?? e);
  }
}, 60 * 60 * 1000);

/* -------------------------- Turjuman jobs pipeline -------------------------- */

ensureTurjumanJobsSchema(db);
const turjumanJobsQueries = makeTurjumanJobsQueries(db);

const TURJUMAN_JOBS_ROOT = process.env.TURJUMAN_JOBS_ROOT
  || path.join(__dirname, "turjuman-jobs");
fs.mkdirSync(TURJUMAN_JOBS_ROOT, { recursive: true });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use("/api/turjuman/jobs", turjumanJobsRouter({
  q: turjumanQueries,
  jobsQ: turjumanJobsQueries,
  isProduction: process.env.NODE_ENV === "production",
}));

// Worker tick every 5s — Plan B Phase 1 is single-in-flight.
setInterval(() => {
  if (!GEMINI_API_KEY) return; // skip if not configured
  tickTurjumanWorker({
    q: turjumanJobsQueries,
    userQ: turjumanQueries,
    jobsRoot: TURJUMAN_JOBS_ROOT,
    geminiApiKey: GEMINI_API_KEY,
    log: (m) => console.log(m),
  }).catch((e) => console.error("[turjuman] tick error:", e));
}, 5000);

const VALID_GAMES = new Set(["sprint", "pulse", "reflex"]);
// Per-game caps to short-circuit obvious cheats. Tune as the games evolve.
const GAME_MAX = { sprint: 2000, pulse: 5000, reflex: 100 };

const insertScore = db.prepare(
  "INSERT INTO scores (game, name, score, meta, country, ip_hash) VALUES (?, ?, ?, ?, ?, ?)"
);
const topScoresStmt = db.prepare(
  // Top distinct (name, score) per game - keep ALL submissions but the leaderboard
  // shows the BEST score per name to discourage spam.
  `SELECT name, MAX(score) AS score, MAX(created_at) AS created_at, MAX(meta) AS meta, MAX(country) AS country
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
const liveStatsStmt = db.prepare(
  // Last-24h stats: distinct players + total runs + last submission timestamp.
  `SELECT
     COUNT(DISTINCT name) AS players,
     COUNT(*) AS runs,
     MAX(created_at) AS lastAt
   FROM scores
   WHERE game = ? AND created_at > ?`
);
const recentRunsStmt = db.prepare(
  // Recent submissions for the live activity ticker (last N within window).
  `SELECT name, score, country, created_at
   FROM scores
   WHERE game = ? AND created_at > ?
   ORDER BY created_at DESC
   LIMIT ?`
);

// In-memory IP→country cache (24h TTL). Avoids hammering the geoip endpoint.
const countryCache = new Map(); // ip -> { country, expiresAt }
const COUNTRY_TTL = 24 * 3600 * 1000;

function clientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    ""
  ).toString().trim();
}

async function lookupCountry(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;
  const cached = countryCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.country;
  try {
    // country.is is free, no key, 100 req/min — plenty for our scale.
    const r = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const c = (j.country || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return null;
    countryCache.set(ip, { country: c, expiresAt: Date.now() + COUNTRY_TTL });
    return c;
  } catch {
    return null;
  }
}

async function getCountry(req) {
  // Path 1: Cloudflare adds CF-IPCountry on every proxied request (free on Free plan).
  // The pages.dev catch-all proxy forwards it as x-forwarded-country.
  const headerCountry = (req.headers["cf-ipcountry"] || req.headers["x-forwarded-country"] || "").toString().toUpperCase();
  if (/^[A-Z]{2}$/.test(headerCountry) && headerCountry !== "XX" && headerCountry !== "T1") {
    return headerCountry;
  }
  // Path 2: direct nginx hit — look up via free geoip with cache.
  return lookupCountry(clientIp(req));
}

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

// "King of Champions" — combined best score across all games per name.
// Each name's contribution is its single best score per game, summed.
const kingStmt = db.prepare(
  `WITH bests AS (
     SELECT name, game, MAX(score) AS best
     FROM scores
     WHERE game IN ('sprint','pulse','reflex')
     GROUP BY name, game
   )
   SELECT
     name,
     SUM(best) AS total,
     COUNT(DISTINCT game) AS gamesPlayed,
     MAX(CASE WHEN game='sprint' THEN best END) AS sprint,
     MAX(CASE WHEN game='pulse'  THEN best END) AS pulse,
     MAX(CASE WHEN game='reflex' THEN best END) AS reflex,
     (SELECT MAX(country) FROM scores s2 WHERE s2.name = bests.name) AS country,
     (SELECT MAX(created_at) FROM scores s2 WHERE s2.name = bests.name) AS lastAt
   FROM bests
   GROUP BY name
   ORDER BY total DESC, gamesPlayed DESC, lastAt ASC
   LIMIT ?`
);
const kingTotalsStmt = db.prepare(
  `SELECT COUNT(DISTINCT name) AS uniqueNames FROM scores WHERE game IN ('sprint','pulse','reflex')`
);

app.get("/api/leaderboard/king", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query?.limit || "10", 10) || 10, 1), 50);
  const top = kingStmt.all(limit).map((r) => ({
    name: r.name,
    total: r.total || 0,
    gamesPlayed: r.gamesPlayed || 0,
    breakdown: {
      sprint: r.sprint || 0,
      pulse: r.pulse || 0,
      reflex: r.reflex || 0,
    },
    country: r.country || null,
    lastAt: r.lastAt || null,
  }));
  const totals = kingTotalsStmt.get();
  res.set("Cache-Control", "public, max-age=10");
  res.json({ top, uniqueNames: totals.uniqueNames || 0 });
});

app.get("/api/leaderboard", (req, res) => {
  const game = String(req.query?.game || "sprint").toLowerCase();
  if (!VALID_GAMES.has(game)) return jsonError(res, "unknown game", 400);
  const limit = Math.min(Math.max(parseInt(req.query?.limit || "10", 10) || 10, 1), 50);
  const rows = topScoresStmt.all(game, limit).map((r) => ({
    name: r.name,
    score: r.score,
    country: r.country || null,
    createdAt: r.created_at,
    meta: r.meta ? safeJson(r.meta) : null,
  }));
  const total = totalSubmissionsStmt.get(game).n;

  // Live activity (last 24h): players, runs, and a small ticker of recent submits.
  const since = Date.now() - 86_400_000;
  const live = liveStatsStmt.get(game, since);
  const recent = recentRunsStmt.all(game, since, 5).map((r) => ({
    name: r.name,
    score: r.score,
    country: r.country || null,
    createdAt: r.created_at,
  }));

  res.set("Cache-Control", "public, max-age=10");
  res.json({
    game,
    total,
    top: rows,
    live: {
      players24h: live.players || 0,
      runs24h: live.runs || 0,
      lastAt: live.lastAt || null,
      recent,
    },
  });
});

app.post("/api/leaderboard", writeLimiter, async (req, res) => {
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

  // Soft anti-cheat: meta-based plausibility check for sprint (correct & wrong
  // counts must roughly justify the score). 60s game, max ~30 questions.
  if (game === "sprint" && body.meta && typeof body.meta === "object") {
    const correct = Number(body.meta.correct) || 0;
    const wrong = Number(body.meta.wrong) || 0;
    if (correct < 0 || correct > 60 || wrong < 0 || wrong > 60) {
      return jsonError(res, "implausible meta for sprint", 400);
    }
    // Worst case max: 60 questions all correct + max speed bonus + max streak.
    const upperBound = correct * (10 + 5 + 10);
    if (score > upperBound + 50) {
      return jsonError(res, "score exceeds plausible upper bound", 400);
    }
  }

  const country = await getCountry(req);
  insertScore.run(game, name, score, metaStr, country, ipHash);
  const rank = rankStmt.get(game, score).rank;
  const total = totalSubmissionsStmt.get(game).n;
  res.json({ ok: true, game, name, score, rank, total, country });
});

/* -------------------------- /api/radar -------------------------- */
// AI Radar — predictive engine. Crawled by scripts/radar-crawl.mjs (cron, every
// 5 min). Captures signals from X / Reddit / HackerNews / GitHub / ProductHunt
// and computes velocity by comparing successive snapshots.

db.exec(`
  CREATE TABLE IF NOT EXISTS radar_signals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source        TEXT NOT NULL,
    external_id   TEXT NOT NULL,
    url           TEXT NOT NULL,
    title         TEXT NOT NULL,
    title_ar      TEXT,
    author        TEXT,
    thumbnail     TEXT,
    body_excerpt  TEXT,
    excerpt_ar    TEXT,
    summary_ar    TEXT,
    category      TEXT,
    lang_detected TEXT,
    raw_meta      TEXT,
    engagement    REAL DEFAULT 0,
    velocity      REAL DEFAULT 0,
    authority     REAL DEFAULT 1,
    cross_source  INTEGER DEFAULT 0,
    score         REAL DEFAULT 0,
    breaking      INTEGER DEFAULT 0,
    posted_at     INTEGER,
    first_seen    INTEGER NOT NULL,
    last_updated  INTEGER NOT NULL,
    translated_at INTEGER,
    UNIQUE(source, external_id)
  );
  CREATE INDEX IF NOT EXISTS idx_radar_score
    ON radar_signals(score DESC, last_updated DESC);
  CREATE INDEX IF NOT EXISTS idx_radar_source_seen
    ON radar_signals(source, first_seen DESC);
  CREATE INDEX IF NOT EXISTS idx_radar_breaking
    ON radar_signals(breaking DESC, score DESC);

  CREATE TABLE IF NOT EXISTS radar_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id    INTEGER NOT NULL,
    engagement   REAL NOT NULL,
    captured_at  INTEGER NOT NULL,
    FOREIGN KEY (signal_id) REFERENCES radar_signals(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_radar_snapshots_signal
    ON radar_snapshots(signal_id, captured_at DESC);
`);

// Idempotent column adds — safe if table existed without these cols.
for (const stmt of [
  "ALTER TABLE radar_signals ADD COLUMN title_ar TEXT",
  "ALTER TABLE radar_signals ADD COLUMN excerpt_ar TEXT",
  "ALTER TABLE radar_signals ADD COLUMN summary_ar TEXT",
  "ALTER TABLE radar_signals ADD COLUMN lang_detected TEXT",
  "ALTER TABLE radar_signals ADD COLUMN translated_at INTEGER",
  // Judge columns: Kimi-powered LLM novelty/impact scorer.
  "ALTER TABLE radar_signals ADD COLUMN judge_novelty INTEGER",   // 1-10
  "ALTER TABLE radar_signals ADD COLUMN judge_impact INTEGER",    // 1-10
  "ALTER TABLE radar_signals ADD COLUMN judge_signal INTEGER",    // 1-10
  "ALTER TABLE radar_signals ADD COLUMN judge_score REAL",        // composite 1-10
  "ALTER TABLE radar_signals ADD COLUMN judge_verdict TEXT",      // brief reason in Arabic
  "ALTER TABLE radar_signals ADD COLUMN judged_at INTEGER",
]) { try { db.exec(stmt); } catch { /* already exists */ } }

// Prune anything older than 7 days every server start (keeps DB small).
db.exec(`DELETE FROM radar_signals WHERE last_updated < (strftime('%s','now') * 1000) - (7 * 86400000)`);

const radarTopStmt = db.prepare(
  `SELECT id, source, external_id, url, title, title_ar, author, thumbnail,
          body_excerpt, excerpt_ar, summary_ar, category, lang_detected,
          raw_meta, engagement, velocity, authority, cross_source,
          score, breaking, posted_at, first_seen, last_updated, translated_at,
          judge_novelty, judge_impact, judge_signal, judge_score, judge_verdict, judged_at
   FROM radar_signals
   WHERE last_updated > ?
     AND (? = '*' OR source = ?)
     AND (? = '*' OR category = ?)
   ORDER BY (score + COALESCE(judge_score, 0) * 0.8) DESC, last_updated DESC
   LIMIT ?`
);

const radarBreakingStmt = db.prepare(
  `SELECT id, source, external_id, url, title, title_ar, author, thumbnail,
          body_excerpt, excerpt_ar, summary_ar, category, lang_detected,
          raw_meta, engagement, velocity, authority, cross_source,
          score, breaking, posted_at, first_seen, last_updated, translated_at,
          judge_novelty, judge_impact, judge_signal, judge_score, judge_verdict, judged_at
   FROM radar_signals
   WHERE last_updated > ? AND breaking = 1
   ORDER BY velocity DESC, score DESC
   LIMIT ?`
);

const radarStatsStmt = db.prepare(
  `SELECT source, COUNT(*) AS n, MAX(last_updated) AS lastAt
   FROM radar_signals
   WHERE last_updated > ?
   GROUP BY source`
);

function shapeRadarRow(r) {
  let meta = null;
  if (r.raw_meta) { try { meta = JSON.parse(r.raw_meta); } catch { /* ignore */ } }
  return {
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    url: r.url,
    title: r.title,
    titleAr: r.title_ar,
    author: r.author,
    thumbnail: r.thumbnail,
    excerpt: r.body_excerpt,
    excerptAr: r.excerpt_ar,
    summaryAr: r.summary_ar,
    category: r.category,
    langDetected: r.lang_detected,
    engagement: r.engagement,
    velocity: r.velocity,
    authority: r.authority,
    crossSource: r.cross_source,
    score: r.score,
    breaking: !!r.breaking,
    translated: !!r.translated_at,
    judge: r.judged_at ? {
      novelty: r.judge_novelty,
      impact: r.judge_impact,
      signal: r.judge_signal,
      score: r.judge_score,
      verdict: r.judge_verdict,
      at: r.judged_at,
    } : null,
    meta,
    postedAt: r.posted_at,
    firstSeen: r.first_seen,
    lastUpdated: r.last_updated,
  };
}

app.get("/api/radar", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const source = String(req.query.source || "*").toLowerCase();
  const category = String(req.query.category || "*").toLowerCase();
  const sinceHours = Math.min(Math.max(parseInt(req.query.sinceHours, 10) || 24, 1), 168);
  const since = Date.now() - sinceHours * 3600 * 1000;
  const rows = radarTopStmt.all(since, source, source, category, category, limit);
  const stats = radarStatsStmt.all(since);
  res.json({
    items: rows.map(shapeRadarRow),
    stats: stats.reduce((acc, s) => ((acc[s.source] = { count: s.n, lastAt: s.lastAt }), acc), {}),
    sinceHours,
    fetchedAt: Date.now(),
  });
});

app.get("/api/radar/breaking", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
  const since = Date.now() - 6 * 3600 * 1000;
  const rows = radarBreakingStmt.all(since, limit);
  res.json({ items: rows.map(shapeRadarRow), fetchedAt: Date.now() });
});

// Ingest pre-collected items from a remote agent (e.g. local Mac running
// codad's agent-browser to scrape X). The agent does the network/auth work
// the VPS can't (logged-in X session, residential IP). VPS just stores +
// scores + translates the items.
const radarIngestLookup = db.prepare(
  "SELECT id, engagement, first_seen FROM radar_signals WHERE source = ? AND external_id = ?"
);
const radarIngestInsert = db.prepare(`
  INSERT INTO radar_signals
    (source, external_id, url, title, author, thumbnail, body_excerpt, category,
     raw_meta, engagement, velocity, authority, cross_source, score, breaking,
     posted_at, first_seen, last_updated)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const radarIngestUpdate = db.prepare(`
  UPDATE radar_signals
  SET engagement = ?, authority = ?, raw_meta = ?,
      thumbnail = COALESCE(?, thumbnail),
      body_excerpt = COALESCE(?, body_excerpt),
      last_updated = ?
  WHERE id = ?
`);
const radarIngestSnap = db.prepare(
  "INSERT INTO radar_snapshots (signal_id, engagement, captured_at) VALUES (?, ?, ?)"
);

app.post("/api/radar/ingest", express.json({ limit: "2mb" }), (req, res) => {
  const secret = process.env.RADAR_REFRESH_SECRET;
  if (!secret) return jsonError(res, "ingest disabled (no secret configured)", 503);
  const provided = (req.headers["x-radar-secret"] || "").toString();
  if (provided !== secret) return jsonError(res, "forbidden", 403);

  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return jsonError(res, "expected { items: [...] }", 400);

  const now = Date.now();
  let inserted = 0, updated = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const it of items) {
      if (!it || !it.source || !it.externalId || !it.url || !it.title) { skipped++; continue; }
      const existing = radarIngestLookup.get(it.source, it.externalId);
      const meta = JSON.stringify(it.meta || {});
      if (existing) {
        radarIngestUpdate.run(
          it.engagement || 0, it.authority || 1, meta,
          it.thumbnail || null, it.excerpt || null, now, existing.id
        );
        radarIngestSnap.run(existing.id, it.engagement || 0, now);
        updated++;
      } else {
        const info = radarIngestInsert.run(
          it.source, it.externalId, it.url, String(it.title).slice(0, 500),
          it.author || null, it.thumbnail || null, it.excerpt || null,
          it.category || null, meta,
          it.engagement || 0, 0, it.authority || 1, it.crossSource || 0,
          0, 0, it.postedAt || now, now, now
        );
        radarIngestSnap.run(info.lastInsertRowid, it.engagement || 0, now);
        inserted++;
      }
    }
  });
  tx();
  res.json({ ok: true, inserted, updated, skipped });
});

// Admin-triggered crawl. Auth via shared secret in RADAR_REFRESH_SECRET env.
// Pentest pentest finding: previously had no mutex / cooldown — fork-and-forget
// allowed a holder of the secret (or anyone after secret leak) to spawn
// unbounded child processes → OOM the VPS. Mutex + 60s cooldown closes that.
let _refreshInFlight = false;
let _refreshLastStart = 0;
app.post("/api/radar/refresh", async (req, res) => {
  const secret = process.env.RADAR_REFRESH_SECRET;
  if (!secret) return jsonError(res, "refresh disabled (no secret configured)", 503);
  const provided = (req.headers["x-radar-secret"] || req.body?.secret || "").toString();
  // Timing-safe compare so we don't leak length/prefix via response timing
  let ok = false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { ok = false; }
  if (!ok) return jsonError(res, "forbidden", 403);
  if (_refreshInFlight) return jsonError(res, "refresh already in flight", 429);
  if (Date.now() - _refreshLastStart < 60_000) return jsonError(res, "cooldown 60s", 429);
  _refreshInFlight = true;
  _refreshLastStart = Date.now();
  // Fork-and-forget — actual crawl is heavy, return immediately.
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [path.join(__dirname, "..", "scripts", "radar-crawl.mjs")], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, RADAR_DB: DB_PATH },
    });
    child.on("exit", () => { _refreshInFlight = false; });
    child.on("error", () => { _refreshInFlight = false; });
    // Safety: clear flag after 5 min even if exit signal misses.
    setTimeout(() => { _refreshInFlight = false; }, 5 * 60_000).unref();
    child.unref();
    res.json({ ok: true, started: true });
  } catch (err) {
    _refreshInFlight = false;
    return jsonError(res, "spawn failed: " + err.message, 500);
  }
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
  console.log(`  ai backend: ${AI_BACKEND}${AI_BACKEND === "kimi" ? ` (${KIMI_MODEL})` : AI_BACKEND === "anthropic" ? ` (${ANTHROPIC_MODEL})` : ""}`);
  console.log(`  elevenlabs: ${ELEVEN_KEY ? "configured" : "missing (using gTTS)"}`);
  console.log(`  leaderboard db: ${DB_PATH}`);
  const radarCount = db.prepare("SELECT COUNT(*) AS n FROM radar_signals").get().n;
  console.log(`  radar signals: ${radarCount}`);
});
