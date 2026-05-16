#!/usr/bin/env node
// AI Radar — translation pass.
//
// Walks `radar_signals` rows where translated_at IS NULL and fills in
// title_ar / excerpt_ar / summary_ar via Kimi K2 (or Claude if available).
//
// Batches 10 items per API call for cost + latency efficiency.
//
// Run after every crawl:
//   */7 * * * * cd /home/alkinani/htdocs/alkinani.live && \
//       node scripts/radar-crawl.mjs && node scripts/radar-translate.mjs >> logs/radar.log 2>&1
//
// Env:
//   ANTHROPIC_API_KEY  — preferred (better Arabic). Else Kimi K2.
//   KIMI_API_KEY       — fallback. KIMI_BASE_URL + KIMI_MODEL same as server.
//   RADAR_DB           — path to leaderboard.db
//   RADAR_TRANSLATE_BATCH (default 10), RADAR_TRANSLATE_MAX (default 60)
//   RADAR_TRANSLATE_DRY  "1" — print, don't write

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.RADAR_DB || path.join(ROOT, "leaderboard.db");
const BATCH = parseInt(process.env.RADAR_TRANSLATE_BATCH || "10", 10);
const MAX = parseInt(process.env.RADAR_TRANSLATE_MAX || "60", 10);
const DRY = process.env.RADAR_TRANSLATE_DRY === "1";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const KIMI_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2-turbo-preview";

function log(...a) { console.log(new Date().toISOString(), "[translate]", ...a); }
function err(...a) { console.error(new Date().toISOString(), "[translate][ERR]", ...a); }

const SYSTEM_PROMPT = `أنت مترجم متخصص في الذكاء الاصطناعي والتقنية. مهمتك ترجمة عناوين ومقتطفات أخبار/أدوات/أبحاث ذكاء اصطناعي إلى عربية فصحى واضحة ومباشرة.

قواعد:
1. ترجمة دقيقة ومحايدة. لا تضف تعليقاً أو رأياً.
2. أبقِ الأسماء التقنية كما هي بالإنجليزية: GPT-5, Claude, LangChain, RAG, Llama, Anthropic, OpenAI, vLLM, Hugging Face. لا تنقحرها.
3. أسماء الشركات والمنتجات تبقى لاتينية. أسماء المستودعات (مثل anthropics/claude-code) تبقى كما هي.
4. المصطلحات التقنية الشائعة: ترجمها إذا مفهومة (نموذج، وكيل، تضمين، تدريب، استنتاج)، أو أبقِها لاتينية إذا التقنية متخصصة (RAG، MCP، RLHF، LoRA).
5. اكتب عنواناً بالعربية ومقتطفاً موجزاً بالعربية لكل عنصر.
6. الملخص (summary_ar) سطر واحد بنجدية واضحة (15-25 كلمة) يفسر *لماذا* هذا مهم لقارئ عربي يتابع الذكاء الاصطناعي.
7. أعد JSON صالحاً فقط — مصفوفة كائنات بنفس الترتيب وبنفس عدد المدخلات.

تنسيق الإخراج (JSON object واحد يحوي مصفوفة translations، لكل عنصر مدخل):
{
  "translations": [
    {"id": <int>, "title_ar": "...", "excerpt_ar": "...", "summary_ar": "..."},
    ...
  ]
}

لا تكتب أي شرح خارج JSON. عدد العناصر في translations = عدد المدخلات.`;

async function loadDb() {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  // Defensive: apply translation columns if absent (server.mjs runs the
  // migration on boot, but if translate runs first this prevents a crash).
  for (const stmt of [
    "ALTER TABLE radar_signals ADD COLUMN title_ar TEXT",
    "ALTER TABLE radar_signals ADD COLUMN excerpt_ar TEXT",
    "ALTER TABLE radar_signals ADD COLUMN summary_ar TEXT",
    "ALTER TABLE radar_signals ADD COLUMN lang_detected TEXT",
    "ALTER TABLE radar_signals ADD COLUMN translated_at INTEGER",
  ]) { try { db.exec(stmt); } catch { /* exists */ } }
  return db;
}

async function callAnthropic(payload) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: payload }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const text = j.content?.[0]?.text || "";
  return text;
}

async function callKimi(payload) {
  const r = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${KIMI_KEY}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: payload },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`kimi ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

function extractJson(s) {
  if (!s) return null;
  // Strip code fences.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  // Find JSON array bounds.
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end <= start) {
    // Maybe wrapped in object {"items":[...]}.
    try {
      const o = JSON.parse(s);
      if (Array.isArray(o)) return o;
      if (Array.isArray(o.items)) return o.items;
      if (Array.isArray(o.translations)) return o.translations;
      if (Array.isArray(o.results)) return o.results;
      return null;
    } catch { return null; }
  }
  try { return JSON.parse(s.slice(start, end + 1)); }
  catch { return null; }
}

async function translateBatch(rows) {
  const items = rows.map(r => ({
    id: r.id,
    source: r.source,
    title: (r.title || "").slice(0, 280),
    excerpt: (r.body_excerpt || "").slice(0, 380),
  }));
  const payload = `ترجم العناصر التالية إلى عربية:\n\n${JSON.stringify(items, null, 2)}`;
  const useAnthropic = !!ANTHROPIC_KEY;
  const text = useAnthropic ? await callAnthropic(payload) : await callKimi(payload);
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`could not parse JSON from response (first 200 chars): ${text.slice(0, 200)}`);
  }
  // Index by id for safety.
  const byId = new Map();
  for (const t of parsed) {
    if (t && (typeof t.id === "number" || typeof t.id === "string")) {
      byId.set(Number(t.id), t);
    }
  }
  return byId;
}

async function main() {
  if (!ANTHROPIC_KEY && !KIMI_KEY) {
    log("no ANTHROPIC_API_KEY or KIMI_API_KEY in env — nothing to do");
    return;
  }
  const db = await loadDb();
  // Pick rows that haven't been translated, prefer high-score ones first.
  const rows = db.prepare(
    `SELECT id, source, title, body_excerpt
     FROM radar_signals
     WHERE translated_at IS NULL
       AND last_updated > ?
     ORDER BY score DESC, last_updated DESC
     LIMIT ?`
  ).all(Date.now() - 48 * 3600 * 1000, MAX);

  if (rows.length === 0) {
    log("no untranslated rows — nothing to do");
    return;
  }
  log(`translating ${rows.length} rows in batches of ${BATCH} (backend=${ANTHROPIC_KEY ? "anthropic" : "kimi"})`);

  const update = db.prepare(
    `UPDATE radar_signals
     SET title_ar = ?, excerpt_ar = ?, summary_ar = ?, lang_detected = ?, translated_at = ?
     WHERE id = ?`
  );

  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const byId = await translateBatch(batch);
      const now = Date.now();
      const apply = db.transaction(() => {
        for (const r of batch) {
          const t = byId.get(r.id);
          if (!t) { fail++; continue; }
          if (DRY) {
            console.log(`  ${r.id} [${r.source}] → ${t.title_ar?.slice(0, 80)}`);
          } else {
            update.run(
              t.title_ar || null,
              t.excerpt_ar || null,
              t.summary_ar || null,
              "translated",
              now,
              r.id
            );
          }
          ok++;
        }
      });
      apply();
      log(`batch ${i / BATCH + 1}: ${batch.length} done`);
    } catch (e) {
      err(`batch ${i / BATCH + 1} failed:`, e.message);
      fail += batch.length;
    }
    // Polite pause between batches.
    if (i + BATCH < rows.length) await new Promise(r => setTimeout(r, 800));
  }

  log(`translation done: ok=${ok} fail=${fail}`);
  db.close();
}

main().catch(e => { err("FATAL", e.stack || e.message); process.exit(1); });
