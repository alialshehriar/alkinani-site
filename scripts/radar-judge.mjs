#!/usr/bin/env node
// AI Radar — LLM novelty/impact judge.
//
// Walks `radar_signals` rows where judged_at IS NULL and assigns 3 scores via
// Kimi K2 (or Anthropic if available):
//   novelty (1-10) — how genuinely new (vs already-known/recycled)
//   impact  (1-10) — how likely this matters / will trend
//   signal  (1-10) — AI-relevance + signal-vs-noise
// Plus a 1-line Najdi verdict explaining the call.
//
// The composite `judge_score = (novelty + impact + signal) / 3` then folds
// into the API ranking via `score + judge_score * 0.8`. So a 9/10 judged
// item beats a 6/10 judged item even if their raw scores are similar.
//
// Run after every crawl in cron:
//   1-59/4 * * * * cd /home/alkinani/htdocs/alkinani.live && set -a && . ./.env && set +a \
//                  && node scripts/radar-judge.mjs >> logs/radar.log 2>&1
// (Offset 1 minute past each crawl so judge sees fresh inserts.)

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.RADAR_DB || path.join(ROOT, "leaderboard.db");
const BATCH = parseInt(process.env.RADAR_JUDGE_BATCH || "8", 10);
const MAX = parseInt(process.env.RADAR_JUDGE_MAX || "40", 10);
const DRY = process.env.RADAR_JUDGE_DRY === "1";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const KIMI_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
// Use the fast non-reasoning model for judgment — we want lots of cheap calls
// per crawl, and the task is structured classification, not creative writing.
// kimi-k2.6 (reasoning) puts output in reasoning_content with json_object mode,
// which makes parsing harder. Keep judgment on the turbo non-reasoning model.
const KIMI_MODEL = process.env.KIMI_JUDGE_MODEL || "kimi-k2-turbo-preview";

function log(...a) { console.log(new Date().toISOString(), "[judge]", ...a); }
function err(...a) { console.error(new Date().toISOString(), "[judge][ERR]", ...a); }

const SYSTEM_PROMPT = `أنت محرّر متخصص في رصد إشارات الذكاء الاصطناعي قبل ما تنتشر. مهمتك تقييم صلاحية كل عنصر للنشر على رادار "alkinani.live" — موقع يصيد الجديد قبل ما يصير ترند.

قيّم كل عنصر بـ٣ أبعاد، كل بعد من ١ (سيء) إلى ١٠ (ممتاز):

١. **novelty** — هل هذا فعلاً جديد؟
   - ١-٣: شي معروف من زمان، ولا تكرار
   - ٤-٦: تحديث/نسخة جديدة لشي موجود
   - ٧-٨: إصدار جديد لـmodel/tool/research
   - ٩-١٠: أول مرة يطلع، concept جديد

٢. **impact** — هل بيصير له تأثير حقيقي؟
   - ١-٣: niche جداً، ما يخدم أحد
   - ٤-٦: مفيد لمجموعة محدودة (مطورين، باحثين)
   - ٧-٨: قابل يصير ترند خلال أسبوع
   - ٩-١٠: تحوّل صناعة (Anthropic/OpenAI/DeepMind launch، model breakthrough)

٣. **signal** — جودة الإشارة AI-related
   - ١-٣: مكرر، spam، مو متعلق بـAI أصلاً
   - ٤-٦: AI-related بس عام
   - ٧-٨: تطبيق AI واضح، فيه قيمة فعلية
   - ٩-١٠: research breakthrough، أو tool فيه adoption مسرع

## قواعد التقييم

- استخدم العنوان والوصف معاً.
- لا تتأثر بالشركة. anthropics-blog-post وOpenAI-blog-post يقيّمون بنفس المعيار.
- repos صغيرة (<100 stars) قد تكون 9/10 لو الفكرة جديدة. الستارز ما تحدد novelty.
- "Show HN" → غالباً novelty 7-8.
- "vs" benchmarks، meta-discussions → impact 4-6.
- شركات معروفة تطلق تحديث بسيط → novelty 4-5.
- إصدارات weights (Llama-X، Qwen-X، DeepSeek) → دائماً 8+ في الـ٣ أبعاد.

## verdict (نجدية، أقل من ١٢ كلمة)
سطر يفسّر القرار: "إصدار MoE جديد يضاهي DeepSeek" أو "أداة قديمة برسالة جديدة" أو "discussion بدون قيمة عملية".

## تنسيق الإخراج

JSON واحد:
{
  "judgments": [
    {"id": <int>, "novelty": <1-10>, "impact": <1-10>, "signal": <1-10>, "verdict": "..."}
  ]
}

عدد العناصر في judgments = عدد المدخلات. لا أي شي خارج الـJSON.`;

async function loadDb() {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  // Defensive: add columns if missing (server.mjs adds them on boot too).
  for (const stmt of [
    "ALTER TABLE radar_signals ADD COLUMN judge_novelty INTEGER",
    "ALTER TABLE radar_signals ADD COLUMN judge_impact INTEGER",
    "ALTER TABLE radar_signals ADD COLUMN judge_signal INTEGER",
    "ALTER TABLE radar_signals ADD COLUMN judge_score REAL",
    "ALTER TABLE radar_signals ADD COLUMN judge_verdict TEXT",
    "ALTER TABLE radar_signals ADD COLUMN judged_at INTEGER",
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
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: payload }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.content?.[0]?.text || "";
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
      max_tokens: 1500,
      // Lower temp = more deterministic ratings. kimi-k2-turbo-preview accepts
      // any temperature; only kimi-k2.6 (reasoning) is locked to 1.
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: payload },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(75000),
  });
  if (!r.ok) throw new Error(`kimi ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

function extractJudgments(s) {
  if (!s) return null;
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const o = JSON.parse(s);
    if (Array.isArray(o)) return o;
    if (Array.isArray(o.judgments)) return o.judgments;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.results)) return o.results;
  } catch {}
  // Bracket fallback
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}

function clamp(v, lo, hi) {
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

async function judgeBatch(rows) {
  const items = rows.map(r => ({
    id: r.id,
    source: r.source,
    title: (r.title || "").slice(0, 240),
    excerpt: (r.body_excerpt || "").slice(0, 200),
  }));
  const payload = `قيّم العناصر التالية:\n\n${JSON.stringify(items, null, 2)}`;
  const useAnthropic = !!ANTHROPIC_KEY;
  const text = useAnthropic ? await callAnthropic(payload) : await callKimi(payload);
  const judgments = extractJudgments(text);
  if (!Array.isArray(judgments)) {
    throw new Error(`could not parse JSON (first 200): ${text.slice(0, 200)}`);
  }
  const byId = new Map();
  for (const j of judgments) {
    if (j && (typeof j.id === "number" || typeof j.id === "string")) {
      byId.set(Number(j.id), j);
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
  const rows = db.prepare(
    `SELECT id, source, title, body_excerpt
     FROM radar_signals
     WHERE judged_at IS NULL
       AND last_updated > ?
     ORDER BY score DESC, last_updated DESC
     LIMIT ?`
  ).all(Date.now() - 24 * 3600 * 1000, MAX);

  if (rows.length === 0) { log("no unjudged rows — nothing to do"); return; }
  log(`judging ${rows.length} rows in batches of ${BATCH} (backend=${ANTHROPIC_KEY ? "anthropic" : "kimi"})`);

  const update = db.prepare(
    `UPDATE radar_signals
     SET judge_novelty = ?, judge_impact = ?, judge_signal = ?,
         judge_score = ?, judge_verdict = ?, judged_at = ?
     WHERE id = ?`
  );

  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const byId = await judgeBatch(batch);
      const now = Date.now();
      const apply = db.transaction(() => {
        for (const r of batch) {
          const j = byId.get(r.id);
          if (!j) { fail++; continue; }
          const novelty = clamp(j.novelty, 1, 10);
          const impact = clamp(j.impact, 1, 10);
          const signal = clamp(j.signal, 1, 10);
          if (novelty == null || impact == null || signal == null) { fail++; continue; }
          const composite = (novelty + impact + signal) / 3;
          const verdict = (j.verdict || "").toString().slice(0, 220) || null;
          if (DRY) {
            console.log(`  ${r.id} [${r.source}] N${novelty} I${impact} S${signal} (${composite.toFixed(1)}) — ${verdict}  ::  ${(r.title || "").slice(0, 70)}`);
          } else {
            update.run(novelty, impact, signal, composite, verdict, now, r.id);
          }
          ok++;
        }
      });
      apply();
      log(`batch ${Math.floor(i / BATCH) + 1}: ${batch.length} done`);
    } catch (e) {
      err(`batch ${Math.floor(i / BATCH) + 1} failed:`, e.message);
      fail += batch.length;
    }
    if (i + BATCH < rows.length) await new Promise(r => setTimeout(r, 800));
  }

  log(`judge done: ok=${ok} fail=${fail}`);
  // Optional: prune low-quality items (signal < 3) to keep the DB lean.
  if (!DRY) {
    const pruned = db.prepare("DELETE FROM radar_signals WHERE judge_signal IS NOT NULL AND judge_signal < 3").run();
    if (pruned.changes > 0) log(`pruned ${pruned.changes} low-signal items`);
  }
  db.close();
}

main().catch(e => { err("FATAL", e.stack || e.message); process.exit(1); });
