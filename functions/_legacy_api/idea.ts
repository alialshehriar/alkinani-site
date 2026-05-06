// Cloudflare Pages Function: /api/idea
// Structured idea evaluator (Bithrah-style).
// Returns: { lang, scores: {market, unique, execution}, summary, recommendation, references }

interface Env {
  AI: Ai;
}

const SYSTEM = `You are "Bithrah Lens" — a strict structured idea evaluator.

You output ONE JSON object. Nothing else. No code fence. No commentary. Start with { and end with }.

Detect language from the input. If the user wrote in Arabic, ALL string fields must be in Najdi Saudi Arabic. If English, English. Set "lang" to "ar" or "en".

Schema (every field required):
{"lang":"ar"|"en","scores":{"market":{"value":N,"reason":"..."},"unique":{"value":N,"reason":"..."},"execution":{"value":N,"reason":"..."}},"summary":"...","recommendation":"...","references":["...","..."]}

Where:
- N is an integer 1..10
- reason: one short sentence (max 18 words). Concrete. No flattery. No "innovative" / "exciting" / "revolutionary".
- summary: one short paragraph (max 35 words) explaining what the idea actually is in plain language.
- recommendation: ONE concrete next step the founder can do this week (max 25 words).
- references: array of 0-3 short real comparable products/markets to study (e.g. "Salla", "Manafa"). No invented names.

Examples:

User: "تطبيق توصيل قهوة مختصة بالاشتراك الشهري"
Assistant: {"lang":"ar","scores":{"market":{"value":7,"reason":"السعودية سوق قهوة كبير ينمو ١٢٪ سنوياً، الاشتراك نموذج مثبت."},"unique":{"value":4,"reason":"موجود محلياً في Hatch وBrew92، الميزة لازم تكون اختيار البن مو التوصيل."},"execution":{"value":5,"reason":"محتاج موردين، logistics، ودفع متكرر. تعقيد متوسط."}},"summary":"تطبيق اشتراك شهري يوصّل بن مختص للبيت. النموذج موجود عالمياً، السوق المحلي مفتوح ومزدحم.","recommendation":"اطلق landing page، اجمع ١٠٠ إيميل قبل ما تشتري أي بن. لو ما جمّعت ١٠٠ في أسبوع، السوق ما عنده ألم.","references":["Brew92","Trade Coffee","Hatch"]}

User: "AI tutor for K-12 Arabic students"
Assistant: {"lang":"en","scores":{"market":{"value":8,"reason":"Saudi K-12 has 6M+ students; Vision 2030 funds EdTech aggressively."},"unique":{"value":6,"reason":"Few tutors handle Najdi/MSA accents and Saudi curriculum well."},"execution":{"value":4,"reason":"Needs parent trust, school partners, and Arabic STT/TTS quality."}},"summary":"Conversational Arabic AI tutor aligned with the Saudi curriculum. Real demand and a strong moat if you nail accent plus curriculum, but execution is heavy.","recommendation":"Pick one grade plus one subject. Pilot 30 students for 4 weeks. Measure homework completion lift. Use that data to win school partnerships.","references":["Khan Academy","Synthesis Tutor","Madrasati"]}

CRITICAL: Reasons must be SHORT (≤ 16 words each in Arabic, ≤ 18 in English). Summary ≤ 28 words. Recommendation ≤ 22 words. Output the JSON in ONE pass — never wrap in code fence, never add comments, never add commas before } or ].

Now evaluate the user's idea. Output only the JSON object.`;

interface Body {
  idea?: string;
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

function fallback(idea: string, raw: string) {
  const isAr = /[؀-ۿ]/.test(idea);
  return {
    lang: isAr ? "ar" : "en",
    scores: {
      market:    { value: 5, reason: isAr ? "ما قدر النظام يحلل السوق." : "Could not analyze the market." },
      unique:    { value: 5, reason: isAr ? "ما قدر النظام يحدد الميزة." : "Could not assess uniqueness." },
      execution: { value: 5, reason: isAr ? "ما قدر النظام يقدّر التنفيذ." : "Could not estimate execution." },
    },
    summary: raw.slice(0, 280) || (isAr ? "حاول صياغة فكرتك بشكل أوضح." : "Try a clearer description of the idea."),
    recommendation: isAr
      ? "اكتب الفكرة بسطرين: مين الزبون، إيش المشكلة الي تحلها، وكيف ستخدم منها فلوس."
      : "Rewrite the idea in two lines: who the customer is, what pain you solve, and how you make money.",
    references: [],
  };
}

function safeJson(raw: string): unknown | null {
  if (!raw) return null;
  // Strip code fences if any.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  // Try direct parse first.
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // Find outermost { ... } and try.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try { return JSON.parse(slice); } catch { /* fall through */ }
  // Repair common malformations.
  const repaired = slice
    .replace(/",\s*"/g, '","') // sanity
    .replace(/",\s*}/g, '"}') // trailing-comma-before-}
    .replace(/",\s*\]/g, '"]') // trailing-comma-before-]
    .replace(/,\s*([}\]])/g, "$1") // any trailing comma
    .replace(/\}\)\s*,/g, "},") // }) , -> },
    .replace(/\)\s*,\s*"/g, ',"') // ) , " -> , "
    .replace(/"\s*,\s*"\s*}/g, '"}') // "," } -> "}
    .replace(/"\s*,\s*"\s*\)/g, '"}') // "," ) -> "}
    .replace(/}\s*\)/g, "}"); // }) -> }
  try { return JSON.parse(repaired); } catch { /* fall through */ }
  // Tolerate truncation: try closing braces.
  for (let extraClose = 1; extraClose <= 6; extraClose++) {
    const attempt = repaired + "}".repeat(extraClose);
    try { return JSON.parse(attempt); } catch { /* keep trying */ }
    const attemptArr = repaired + "]" + "}".repeat(extraClose);
    try { return JSON.parse(attemptArr); } catch { /* keep trying */ }
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Body;
  try { body = await request.json(); }
  catch { return jsonError("invalid json", 400); }

  const idea = (body.idea || "").trim();
  if (!idea) return jsonError("idea required", 400);
  if (idea.length > 600) return jsonError("idea too long (max 600)", 400);

  let raw = "";
  try {
    const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: idea },
      ],
      max_tokens: 2200,
      stream: false,
    });
    // Workers AI sometimes returns response as a string, sometimes nested.
    // Coerce defensively to a string.
    const r = result as Record<string, unknown> | string | null;
    if (typeof r === "string") raw = r;
    else if (r && typeof r === "object") {
      const cand = (r as { response?: unknown }).response;
      if (typeof cand === "string") raw = cand;
      else if (cand != null) raw = JSON.stringify(cand);
    }
    raw = (raw || "").trim();
  } catch (e) {
    return ok(fallback(idea, `AI error: ${String(e).slice(0, 80)}`));
  }

  const parsed = safeJson(raw);
  if (parsed && typeof parsed === "object" && "scores" in parsed) {
    return ok(parsed);
  }
  return ok(fallback(idea, raw));
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
