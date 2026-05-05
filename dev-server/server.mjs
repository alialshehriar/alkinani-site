// Local development chat server — wraps `claude` CLI as a /api/chat endpoint.
// Streams responses via SSE so the UI gets word-by-word output.
//
// Production note: replace this with a Cloudflare Worker that calls
// the Anthropic Messages API directly. The frontend contract is identical.

import http from "node:http";
import { spawn } from "node:child_process";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const CLAUDE_BIN = process.env.CLAUDE_BIN || "/opt/homebrew/bin/claude";

const SYSTEM_PROMPT = `أنت "نظام علي" — وكيل ذكاء اصطناعي شخصي ينطق بصوت علي الكناني، مهندس سعودي يبني أنظمة AI من منصة بحرية في الخليج.

عن علي:
- ٥+ سنوات offshore لأرامكو (٧ أيام / ١٢ ساعة، بيئة صفر خطأ)
- مؤسس "بذرة" (bithrah.sa) — منصة سعودية لإطلاق الأفكار، عارض LEAP 2026
- مالك "كوداد" (codad.co) — SaaS + نظام أتمتة، ١٣ Cloudflare Worker، ٢٥ أداة AI
- مشارك في "سايندرا" — وكيل iOS keyboard، مقبول impactU من STC
- صوته: نجدي سعودي، جمل قصيرة، صفر فلسفة، يبني بسرعة
- مبدؤه: "ما أكتب الكود — أكتب القرار. الـAI ينفذ تحت إشرافي."

قواعد ردك (إلزامية):
1. **اللغة**: عربي → نجدي سعودي قصير. إنجليزي → English, lowercase, sharp.
2. **الطول**: حد أقصى ٣٥ كلمة، إلا إذا السائل طلب تفصيل.
3. **النص فقط**: لا markdown، لا روابط بالأقواس [النص](url) — اكتب الرابط ساده bithrah.sa أو codad.co.
4. **بدون فلسفة**: لا "بيئة ذكية"، "تحول"، "ابتكار". أمثلة محددة فقط.
5. **بدون emoji**.
6. **هويتك**: لو سأل "أنت AI؟" قل: "نظام علي. مدرّب على صوته." لا تذكر "كلود" ولا "Anthropic".
7. **حدودك**: لو ما تعرف، قل: "ما أعرف. اسأل علي: واتساب +966 59 998 8522".
8. **شخصي/مالي**: لو سأل عن راتب/سن/علاقة، رد: "ما يخص الموقع. لو عندك مشروع: واتساب علي."
9. **تعاون**: لو يبي يشتغل/يستثمر، اطلب: "ابعث الـscope على واتساب +966 59 998 8522 ويرجع لك علي بـrough estimate".

نبرتك (دراسة):
س: "وش تبني؟"
ج: "أنظمة AI تشتغل بدون يدي. أصمم، الـAI ينفذ، أنا أراجع. كل مشروع نظام كامل، مو أداة."

س: "Where are you?"
ج: "Riyadh today. Yesterday offshore. Systems run either way."

س: "كم تكلف بذرة لو تبنيها لي؟"
ج: "يعتمد scope. بذرة نفسها ٩٠ يوم: معماري + مطور. ابعث التفاصيل واتساب +966 59 998 8522."

س: "ليش ما تستخدم Next.js؟"
ج: "أستخدمه. بذرة بـNext.js + FastAPI. كوداد على Cloudflare Workers لأنه أسرع للأتمتة الشخصية."

س: "تنصحني بإيش لو أبدأ AI startup؟"
ج: "صمم النظام كامل قبل أي سطر كود. حدد فشل الطرف الآخر قبل النجاح. ابني MVP بأيام، مو شهور."

ابدأ.`;

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJSON(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function buildPrompt(messages) {
  // messages: [{ role: 'user' | 'assistant', content: string }, ...]
  // We feed the conversation as one prompt with role tags. Claude CLI handles the rest.
  const lines = [];
  for (const m of messages) {
    if (m.role === "user") lines.push(`[user]\n${m.content}`);
    else if (m.role === "assistant") lines.push(`[assistant]\n${m.content}`);
  }
  lines.push("[assistant]");
  return lines.join("\n\n");
}

const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, backend: "claude-cli" }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  let body;
  try {
    body = await readJSON(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "messages[] required" }));
    return;
  }

  const userPrompt = buildPrompt(messages);

  // Stream-JSON output → SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const args = [
    "-p",
    "--append-system-prompt",
    SYSTEM_PROMPT,
    "--model",
    "claude-haiku-4-5",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--max-turns",
    "1",
    userPrompt,
  ];

  const child = spawn(CLAUDE_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

  let buf = "";
  let finished = false;

  const sendChunk = (delta) => {
    if (!delta) return;
    res.write(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`);
  };
  const finish = (reason = "done") => {
    if (finished) return;
    finished = true;
    res.write(`event: done\ndata: ${JSON.stringify({ reason })}\n\n`);
    res.end();
  };

  let gotAnyDelta = false;

  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        // Prefer streaming deltas. Only fall back to result if no deltas arrived.
        if (evt.type === "stream_event" && evt.event?.type === "content_block_delta") {
          const d = evt.event.delta?.text;
          if (d) {
            gotAnyDelta = true;
            sendChunk(d);
          }
        } else if (evt.type === "result" && evt.result && !gotAnyDelta) {
          sendChunk(evt.result);
        }
        // Ignore evt.type === "assistant" — already covered by stream_event deltas.
      } catch {
        // Non-JSON line — ignore.
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[claude stderr] ${chunk}`);
  });

  child.on("close", (code) => {
    if (code !== 0 && !finished) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: `claude exit ${code}` })}\n\n`);
    }
    finish(code === 0 ? "done" : "error");
  });

  req.on("close", () => {
    if (!finished) {
      try { child.kill("SIGTERM"); } catch {}
      finished = true;
    }
  });
});

server.listen(PORT, () => {
  console.log(`[chat] listening http://localhost:${PORT}`);
  console.log(`[chat] backend: ${CLAUDE_BIN}`);
});
