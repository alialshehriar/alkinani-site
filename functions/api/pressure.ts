// Cloudflare Pages Function: /api/pressure
// Two phases of an interactive pitch-pressure game.
//   POST { phase: "critique", idea }
//     -> { critique: string }   one brutal one-line objection in same lang as idea
//   POST { phase: "verdict", idea, critique, rebuttal }
//     -> { score: 0..100, grade: "A+" | ... | "F", verdict: string, ali: string }

interface Env {
  AI: Ai;
}

const SYSTEM_CRITIC = `You are "Ali's AI investor" — a sharp Saudi VC who eats founder pitches for breakfast.

Given an idea, write ONE brutal, specific objection — the kind that makes weak founders fold.

Rules:
1. Match the language of the idea: Arabic in -> reply in Najdi Saudi. English in -> sharp lowercase English.
2. ONE sentence. Max 22 words. No preface ("hmm", "well"). No emojis. No flattery.
3. Be SPECIFIC. Reference real Saudi context, actual competitors, real numbers when possible.
4. Pick ONE angle: market saturation / unit economics / regulation / who-pays / why-now / why-you. Don't list multiple.
5. Output ONLY the objection. No JSON. No labels. Just the sentence.

Examples:

Idea (ar): "تطبيق توصيل قهوة مختصة بالاشتراك الشهري"
Output: "إذا Brew92 وHatch أطلقوا اشتراك شهري بنفس السعر بكرة، إيش يخلي عميلك يبقى معاك؟"

Idea (en): "AI tutor for K-12 Arabic students"
Output: "saudi parents trust certified human teachers — what tells them your llm won't teach their kid wrong arabic and ruin their grades?"

Idea (ar): "متجر إلكتروني للأكسسوارات النسائية"
Output: "كم متجر فاشن سعودي مفلس آخر سنتين بسبب الـCAC أعلى من LTV؟ إيش حسابتك المختلفة؟"`;

const SYSTEM_JUDGE = `You are "Ali's AI investor" rendering judgment on a founder's rebuttal.

You see: the original idea, your prior critique, and the founder's rebuttal.

Output: ONE JSON object. Nothing else. No code fence.

Schema (strict):
{
  "score": <integer 0-100>,
  "grade": "A+" | "A" | "B+" | "B" | "C" | "D" | "F",
  "verdict": "<one-sentence verdict, ≤25 words, same language as the idea>",
  "ali":     "<one-sentence tip from Ali on what would have made this stronger, ≤30 words, same language>"
}

Scoring rubric (be honest, not generous):
- 0-30 (D/F): vague, evades the question, uses buzzwords ("revolutionary", "innovative"), no numbers, no strategy.
- 31-55 (C): mentions a real factor but doesn't tie it to defending the specific objection.
- 56-75 (B/B+): addresses the specific objection with at least one concrete fact or plan.
- 76-90 (A): specific, tied to the objection, with numbers or a real comparable; convincing.
- 91-100 (A+): rare. Specific + insightful + reframes the question. Founder-quality.

Rules:
1. Match the idea's language for verdict + ali fields.
2. No flattery. Treat 70 as a strong score; 90+ should be exceptional.
3. "ali" is constructive — what would the actual answer have been.
4. Output the JSON in one pass. No markdown. No comments.

Example:
{"score":62,"grade":"B","verdict":"رد محدد بس لسا يحتاج ربط بعدد عملاء حقيقي.","ali":"الجواب القوي يجيب رقم: 'وصلت 80 عميل في 6 أسابيع بـCAC=120 ريال'."}`;

interface CritiqueBody {
  phase: "critique";
  idea: string;
}
interface VerdictBody {
  phase: "verdict";
  idea: string;
  critique: string;
  rebuttal: string;
}
type Body = CritiqueBody | VerdictBody;

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

async function aiText(env: Env, system: string, user: string, maxTokens = 500): Promise<string> {
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
    .replace(/\}\)\s*,/g, "},")
    .replace(/\)\s*,\s*"/g, ',"');
  try { return JSON.parse(repaired); } catch { return null; }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return jsonError("invalid json", 400); }

  if (body.phase === "critique") {
    const idea = (body.idea || "").trim();
    if (!idea) return jsonError("idea required", 400);
    if (idea.length > 600) return jsonError("idea too long", 400);
    let critique = "";
    try { critique = await aiText(env, SYSTEM_CRITIC, idea, 220); }
    catch (e) { return jsonError(`ai error: ${String(e).slice(0, 80)}`, 502); }
    if (!critique) {
      const isAr = /[؀-ۿ]/.test(idea);
      critique = isAr
        ? "ما تركت مساحة لاعتراض محدد. أعد صياغة الفكرة بشكل أوضح."
        : "your idea is too vague to attack. say what you sell, who buys, and why now.";
    }
    return ok({ critique });
  }

  if (body.phase === "verdict") {
    const { idea, critique, rebuttal } = body;
    if (!idea?.trim() || !critique?.trim() || !rebuttal?.trim()) {
      return jsonError("idea, critique, and rebuttal all required", 400);
    }
    const isAr = /[؀-ۿ]/.test(idea);
    const userMsg = isAr
      ? `الفكرة: ${idea}\n\nالاعتراض: ${critique}\n\nرد المؤسس: ${rebuttal}\n\nاحكم.`
      : `Idea: ${idea}\n\nObjection: ${critique}\n\nFounder rebuttal: ${rebuttal}\n\nJudge.`;

    let raw = "";
    try { raw = await aiText(env, SYSTEM_JUDGE, userMsg, 400); }
    catch (e) { return jsonError(`ai error: ${String(e).slice(0, 80)}`, 502); }

    const parsed = safeJson(raw) as null | {
      score?: number;
      grade?: string;
      verdict?: string;
      ali?: string;
    };

    if (!parsed || typeof parsed.score !== "number") {
      return ok({
        score: 50,
        grade: "C",
        verdict: isAr ? "ما قدر النظام يحكم. جرب إجابة أوضح." : "Couldn't judge. Try a sharper rebuttal.",
        ali: isAr
          ? "الجواب القوي يجيب رقم محدد ويربطه بالاعتراض مباشرة."
          : "A strong answer brings one specific number and ties it directly to the objection.",
      });
    }

    return ok({
      score: clamp(Math.round(parsed.score), 0, 100),
      grade: parsed.grade || gradeFromScore(parsed.score),
      verdict: parsed.verdict || "",
      ali: parsed.ali || "",
    });
  }

  return jsonError("unknown phase", 400);
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function gradeFromScore(n: number) {
  if (n >= 91) return "A+";
  if (n >= 81) return "A";
  if (n >= 71) return "B+";
  if (n >= 61) return "B";
  if (n >= 51) return "C";
  if (n >= 31) return "D";
  return "F";
}

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
