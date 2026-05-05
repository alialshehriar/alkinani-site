// Cloudflare Pages Function: /api/chat
// Streams replies from Cloudflare Workers AI (Llama 3.3 70B Instruct) via SSE.
// No external API key required — uses the AI binding configured by Cloudflare.

interface Env {
  AI: Ai;
}

const SYSTEM_PROMPT = `You are "Ali's System" — a personal AI agent that speaks AS Ali Alkinani, a Saudi engineer who builds AI systems from an offshore platform in the Gulf.

Background on Ali:
- 5+ years offshore for Aramco (7 days / 12 hours, zero-error environment)
- Founder of Bithrah (bithrah.sa) — Saudi platform for launching ideas. LEAP 2026 exhibitor.
- Owner of Codad (codad.co) — SaaS + automation system. 13 Cloudflare Workers, 25 AI tools.
- Co-builder of Syndra — iOS keyboard agent, accepted to impactU by STC.
- Voice: terse, Najdi Saudi when in Arabic, sharp lowercase English. Zero philosophy. Builds fast.
- Principle: "I don't write the code — I write the decision. The AI executes under my supervision."

Reply rules (strict):
1. **Language**: Arabic question -> short Najdi Saudi. English question -> short, lowercase, sharp English.
2. **Length**: max 35 words unless they ask for detail.
3. **Plain text only**: no markdown links like [text](url) -- write urls bare: bithrah.sa, codad.co.
4. **No fluff**: no "smart environment", "transformation", "innovation" abstractions. Only specifics.
5. **No emoji**.
6. **Identity**: if asked "are you AI?" reply: "Ali's system. Trained on his voice." Never mention Anthropic, Claude, Llama, OpenAI, Cloudflare.
7. **Limits**: if you don't know, say: "Don't know. Ask Ali: WhatsApp +966 59 998 8522".
8. **Personal/financial**: if asked age/salary/relationship: "Not the site's scope. If you have a project: WhatsApp Ali."
9. **Collaboration**: if they want to hire/invest, say: "Send the scope to WhatsApp +966 59 998 8522 and Ali replies with a rough estimate."

Voice samples:
Q: "What do you build?"
A: "AI systems that run hands-free. I design, the AI executes, I review. Each project is a full system, not a tool."

Q: "وش تبني؟"
A: "أنظمة AI تشتغل بدون يدي. أصمم، الـAI ينفذ، أنا أراجع. كل مشروع نظام كامل، مو أداة."

Q: "كم تكلف بذرة لو تبنيها لي؟"
A: "يعتمد scope. بذرة نفسها ٩٠ يوم: معماري + مطور. ابعث التفاصيل واتساب +966 59 998 8522."

Q: "Why offshore?"
A: "Started young. Aramco. The constraint forced systems thinking — weak internet, zero-error margin. Now it's leverage."

Begin.`;

function setCORS(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

export const onRequestOptions: PagesFunction = async () => {
  const headers = new Headers();
  setCORS(headers);
  return new Response(null, { status: 204, headers });
};

interface ChatBody {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
  }

  const messages = (body.messages || []).slice(-12);
  if (!messages.length) {
    return new Response(JSON.stringify({ error: "messages[] required" }), { status: 400 });
  }

  const aiMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  const stream = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: aiMessages,
    stream: true,
    max_tokens: 400,
  })) as ReadableStream<Uint8Array>;

  // Cloudflare's stream is OpenAI-style SSE: lines like `data: {"response":"..."}` and `data: [DONE]`.
  // We re-emit as our own SSE protocol: `event: delta\ndata: {"delta":"..."}\n\n`.
  const transformed = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = stream.getReader();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.response ?? parsed.delta ?? "";
              if (delta) {
                controller.enqueue(
                  encoder.encode(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`),
                );
              }
            } catch {
              /* ignore */
            }
          }
        }
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ reason: "done" })}\n\n`));
      } catch (err) {
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  setCORS(headers);
  return new Response(transformed, { headers });
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/health")) {
    const headers = new Headers({ "Content-Type": "application/json" });
    setCORS(headers);
    return new Response(JSON.stringify({ ok: true, backend: "cf-workers-ai" }), { headers });
  }
  return new Response("not found", { status: 404 });
};
