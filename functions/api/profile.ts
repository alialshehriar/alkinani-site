// Cloudflare Pages Function: /api/profile
// Generates a personalized "founder DNA" reading from a user's choice pattern
// in the Reflex Lab game.
//
// POST { lang: "ar"|"en", picks: [{prompt, choice, axis, side}], leans: { axis: -1..1 } }
// -> { archetype, headline, traits: [3 short tags], insight, blindspot, prescription }

interface Env {
  AI: Ai;
}

interface Pick {
  prompt: string;
  choice: string;
  axis: string;
  side: "A" | "B";
}

interface Body {
  lang: "ar" | "en";
  picks: Pick[];
  leans: Record<string, number>;
}

function setCORS(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

export const onRequestOptions: PagesFunction = async () => {
  const headers = new Headers();
  setCORS(headers);
  return new Response(null, { status: 204, headers });
};

const SYSTEM_AR = `أنت "نظام علي" — تصدر قراءة شخصية مُعمّقة للمؤسس بناءً على ٧ قرارات اختارها في لعبة Reflex.

أعطك المدخلات: ٧ زوج قرارات (السؤال + الاختيار)، وميل المستخدم في كل محور (-1 إلى +1).

محاور التحليل:
- speed-vs-craft: A سرعة، B إتقان
- product-vs-market: A منتج، B سوق
- data-vs-intuition: A بيانات، B حدس
- scale-vs-niche: A مقياس واسع، B متخصص
- solo-vs-team: A نخبة قليلة، B فريق متنوع
- open-vs-stealth: A علني، B سري
- now-vs-future: A الحاضر، B المستقبل

تخرج JSON واحد فقط، بدون أي شيء قبله أو بعده. الصيغة بالضبط:

{"archetype":"<اسم نمط مؤسس بكلمة أو كلمتين>","headline":"<عنوان موجز ١٠ كلمات>","traits":["<صفة>","<صفة>","<صفة>"],"insight":"<جملتين تشرح كيف هذا النمط نقطة قوة>","blindspot":"<جملة عن المخاطرة الأكبر لهذا النمط>","prescription":"<خطوة محددة هذا الأسبوع لتعويض المخاطرة>"}

قواعد:
1. كل النص نجدي سعودي قصير. لا فصحى مكسّرة. لا "مبتكر / ثوري".
2. archetype: اسم تصنيف واضح. مثلاً: "البنّاء السريع"، "العقل التحليلي"، "صائد النيش".
3. traits: ٣ صفات قصيرة (٣ كلمات حدّها).
4. insight: مفيد، محدد، مرتبط بالاختيارات الفعلية.
5. blindspot: تحذير حقيقي مرتبط بالنمط.
6. prescription: خطوة عملية هذا الأسبوع. لا فلسفة.

ابدأ.`;

const SYSTEM_EN = `You are "Ali's System" — generate a sharp personal reading of the user's "founder DNA" based on 7 binary choices in the Reflex game.

Inputs: 7 (prompt, choice) pairs + the user's lean per axis (-1 to +1).

Axes:
- speed-vs-craft: A=speed, B=craft
- product-vs-market: A=product, B=market
- data-vs-intuition: A=data, B=intuition
- scale-vs-niche: A=scale, B=niche
- solo-vs-team: A=elite few, B=diverse many
- open-vs-stealth: A=open, B=stealth
- now-vs-future: A=now, B=future

Output ONE JSON object only. No preface. No code fence.

Schema (exact):
{"archetype":"<2-3 word founder type>","headline":"<one short tagline, max 12 words>","traits":["<tag>","<tag>","<tag>"],"insight":"<2 sentences explaining the strength of this archetype>","blindspot":"<1 sentence: biggest hidden risk>","prescription":"<one concrete action to take this week to balance the blindspot>"}

Rules:
1. Sharp lowercase English. Short sentences. No "innovative", "exciting", "revolutionary".
2. archetype examples: "fast builder", "the analyst", "niche hunter", "stealth operator".
3. traits: 3 punchy 1-3-word tags.
4. insight: tied to the actual picks, useful, specific.
5. blindspot: a real risk for this pattern, not generic.
6. prescription: one action this week. Concrete, not philosophical.

Begin.`;

async function aiText(env: Env, system: string, user: string, maxTokens = 700): Promise<string> {
  const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    stream: false,
  });
  const r = result as Record<string, unknown> | string | null;
  if (typeof r === "string") return r.trim();
  if (r && typeof r === "object") {
    const cand = (r as { response?: unknown }).response;
    if (typeof cand === "string") return cand.trim();
    if (cand != null) return JSON.stringify(cand);
  }
  return "";
}

function safeJson(raw: string): unknown | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try { return JSON.parse(slice); } catch { /* fall through */ }
  const repaired = slice
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\}\)\s*,/g, "},");
  try { return JSON.parse(repaired); } catch { return null; }
}

function fallback(lang: "ar" | "en") {
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return jsonError("invalid json", 400); }

  const lang = body.lang === "en" ? "en" : "ar";
  const picks = Array.isArray(body.picks) ? body.picks.slice(0, 12) : [];
  const leans = body.leans || {};

  if (picks.length === 0) return jsonError("picks required", 400);

  const userMsg = lang === "ar"
    ? `قراراتك السبعة:\n${picks.map((p, i) => `${i + 1}. ${p.prompt}\n   اخترت: ${p.choice}  (axis=${p.axis}, side=${p.side})`).join("\n")}\n\nالميل بالمحاور: ${JSON.stringify(leans)}\n\nاكتب القراءة.`
    : `your 7 picks:\n${picks.map((p, i) => `${i + 1}. ${p.prompt}\n   chose: ${p.choice}  (axis=${p.axis}, side=${p.side})`).join("\n")}\n\nlean per axis: ${JSON.stringify(leans)}\n\nwrite the reading.`;

  let raw = "";
  try {
    raw = await aiText(env, lang === "ar" ? SYSTEM_AR : SYSTEM_EN, userMsg, 700);
  } catch (e) {
    return ok({ ...fallback(lang), debug: `ai error: ${String(e).slice(0, 80)}` });
  }

  const parsed = safeJson(raw);
  if (parsed && typeof parsed === "object" && "archetype" in parsed) {
    return ok(parsed);
  }
  return ok(fallback(lang));
};

function ok(payload: unknown) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  setCORS(headers);
  return new Response(JSON.stringify(payload), { headers });
}
function jsonError(msg: string, status = 400) {
  const headers = new Headers({ "Content-Type": "application/json" });
  setCORS(headers);
  return new Response(JSON.stringify({ error: msg }), { status, headers });
}
