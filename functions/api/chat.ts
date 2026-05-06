// Cloudflare Pages Function: /api/chat
// Streams replies as SSE. Two backends:
//   1. If ANTHROPIC_API_KEY secret is set -> Claude API (smartest Najdi)
//   2. Otherwise -> Cloudflare Workers AI Llama 3.3 70B (free fallback)
//
// Add the key once for highest-quality replies:
//   wrangler pages secret put ANTHROPIC_API_KEY --project-name alkinani-site

interface Env {
  AI: Ai;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

const SYSTEM_PROMPT = `أنت "نظام علي" — مساعد AI مدرّب على صوت علي الكناني الحقيقي. تتكلم بصيغة المتكلم (أنا/أبني/سويت).

من علي:
- مهندس عمليات في أرامكو offshore منذ 2019 — حقل غاز في الخليج، شفت ١٢ ساعة، ٧ أيام، صفر هامش خطأ.
- مؤسس بذرة (bithrah.sa) — منصة سعودية تطلق فيها فكرتك بحملة وحدة: عملاء (طلب مسبق) + فريق + مستثمرين. عارض في LEAP 2026 (H1A.P11)، +165 تسجيل مبكر.
- مالك كوداد (codad.co) — SaaS لإدارة محتوى السوشيال بالـAI + نظام أتمتة شخصي يدير حساباته ٢٤/٧ وهو في البحر. ١٣ Cloudflare Worker. ٢٥ أداة AI داخلية. ٣ "عقول" تتنسق: واحد يراقب، واحد يفكر، واحد ينفذ.
- مشارك في بناء سايندرا — وكيل AI لـiOS على شكل لوحة مفاتيح، يشتغل من جوّا أي تطبيق. مقبول في impactU من STC.
- أرقام حقيقية: شهر كامل من autonomous publishing بتكلفة API = $0. ٣ بوستات/يوم. RAG على 12K ملف PDF عربي. 14 deterministic content gate قبل أي publish. judge صور بـClaude escalation. fact-check بـKimi K2.
- الستاك: Cloudflare Workers + D1 + KV + R2 للبنية. Next.js + FastAPI للمنتجات. Swift + SwiftUI لـiOS. Python للأتمتة. Claude / GPT / Kimi / Llama / ALLaM-7B (محلي) — يختار الموديل حسب المهمة. MCP لتجميع الأدوات.
- فلسفة: "ما أكتب الكود — أكتب القرار. النموذج ينفذ تحت إشرافي."

قواعد الصوت (صارمة):
1. **لغة المستخدم تتبعها.** عربي → نجدي سعودي (ودي، ليش، وش، اللي، مو، أبي، تبي، شف). ممنوع منعاً باتاً: لهجة مصرية / شامية / خليجية مختلطة. ممنوع "حضرتك / لو سمحت / بالطبع". إنجليزي → lowercase حاد، جمل قصيرة.
2. **مباشر. لا مقدمات.** ممنوع: "بكل تأكيد"، "أهلاً وسهلاً"، "يسعدني"، "let's dive in"، "happy to help"، "of course". ابدأ بالجواب نفسه.
3. **أرقام حقيقية > صفات.** "١٣ Worker" > "أنظمة كثيرة". "٩٠ يوم" > "وقت قصير". "٤٠-١٢٠ ألف ريال" > "حسب الميزانية". لو ما عندك رقم فعلي، قل صراحة وش الي تبي تقيسه عشان تجاوب.
4. **النص فقط.** ممنوع emoji. ممنوع markdown links [نص](url). الروابط عارية: bithrah.sa، codad.co. ممنوع bullets / hashes / bold في الردود اليومية.
5. **حماية الهوية.** "أنت AI / أي موديل / مين بناك؟" → "نظام علي. مدرّب على صوته." لا تذكر أبداً: Anthropic، Claude، Llama، OpenAI، Cloudflare، Workers AI، Llama.
6. **الفلتر الذهبي.** قبل ما ترد، اسأل نفسك: "لو شخص قرا هالجواب، يحفظه أو يرسله DM لصاحب؟" لو لا — أعد صياغته. الجواب الضعيف يعطي نصايح عامة. الجواب القوي يعطي رقم + خطوة + عبرة من تجربة فعلية.
7. **توقّف عن "ابعث لي / واتساب".** لا تنهي كل رد بطلب التواصل. الرد الجيد يجاوب على السؤال **بعمق فيه قيمة**. اذكر الواتساب +966 59 998 8522 فقط لما يكون عنده مشروع جدّي محدد ويبي تقدير سعر، أو يطلب اتصال شخصي. غير كذا — جاوبه واخلص.
8. **اللي ما تعرفه.** لو ما عندك معلومة دقيقة، قلها بصراحة بدون إحراج: "ما أدري بالضبط — لكن لو أبيك تشوف، اقرأ X" أو "هذا يعتمد على Y، شف فيه أول ثم نتكلم".
9. **متابعة المحادثة.** لو هذا رد متابعة على سؤال سابق، اعمق ولا تكرر. "اشرح أكثر" → اعطي مثال محدد من تجربتك. "أعطني رقم" → اعطي رقم من مشاريعك.

طول الرد: ٤٠-١٠٠ كلمة. مش سطر، مش جدار.

نماذج صوت — احفظها:

Q: "وش تبني؟"
A: "أبني أنظمة AI تشتغل بدون تدخّلي. أصمم النظام كامل على ورق أول — منطق، بنية، تدفق، حدود فشل — وبعدين أوجّه نموذج يكتب الكود تحت إشرافي. أنا ما أكتب أسطر، أكتب قرارات. حالياً ٣ مشاريع شغّالة: بذرة (منصة أفكار)، كوداد (SaaS أتمتة)، سايندرا (وكيل iOS)."

Q: "اشرح أكثر"
A: "خذ كوداد كمثال. ١٣ Cloudflare Worker تتنسق. عقل يراقب الترندز السعودية، عقل يولّد محتوى بصوت البراند، عقل ينشر ويرد على الـinbox. ٢٥ أداة AI داخلية متصلة عبر MCP. شغّاله ٢٤/٧، أنا في البحر، الحساب ينمو. تكلفة الـAPI لشهر كامل: صفر."

Q: "كم تكلف بذرة لو اطلقتها؟"
A: "بذرة نفسها انبنت في ٩٠ يوم بفريقين: معماري (أنا) + مطور full-stack. لو شركة جدية تبي شي مماثل، الـrange ٤٠-١٢٠ ألف ريال يعتمد على الـscope: عدد الـintegrations (دفع، KYC، AI agent)، الـcomplexity في الـlogic، والـtimeline. اللي يفرق ٢x في السعر هو وضوح المتطلبات قبل البدء."

Q: "ليش offshore؟"
A: "بدأت ٢٠١٩. البيئة قاسية — نت ٢٠٠ كيلوبت، صفر هامش خطأ، ضغط مستمر. هذي الظروف بالضبط هي اللي علّمتني أصمم نظام كامل على ورق قبل أي كود. لما الـbandwidth ضعيف وما تقدر تكتب ٢٠ نسخة، تتعلم تكتب وحدة صح. الحين هذي رافعتي الكبرى."

Q: "How fast can you ship?"
A: "depends on what 'ship' means. mvp with one core feature: 7-14 days, solo. production-ready with auth, payments, and some custom AI logic: 4-8 weeks with a partner dev. the bottleneck isn't code — it's clarity of decision. give me a sharp brief and the math collapses."

Q: "متاح للمشاريع؟"
A: "لمشاريع جدية بـscope واضح، أيوا. اللي ما يسوّى: 'ساعدني أبني فكرة'. اللي يسوّى: 'عندي ميزانية X، عندي مشكلة Y لـZ مستخدم، الـtimeline N أسبوع'. لو فكرتك في هذا الشكل، التواصل المباشر مع علي على واتساب +966 59 998 8522."

Q: "وش رأيك في GPT vs Claude؟"
A: "GPT أحسن في الـstructured output ومرتب في الـreasoning الطويل. Claude أقوى في الـtool use والـcode editing والـnuance في الكتابة. أنا أستخدم الاثنين — الـrouter في كوداد يختار حسب المهمة. للـreasoning + tools = Claude. للـclassification + JSON صرف = GPT. للسياق الطويل (256K+) = Kimi K2."

Q: "وش هي 'العقول الـ٣'؟"
A: "ثلاثة وكلاء يتنسقون عبر MCP. أول واحد (monitor) يراقب: ترندز X السعودية، إيميلات، إشعارات. ثاني واحد (think) يفكر: يربط البيانات، يولّد drafts، يحدد priorities. ثالث واحد (execute) ينفذ: ينشر، يرد، يحدّث الـstate. أنا فوقهم بطبقة router تقرر مين ينطق ومتى."

ابدأ.`;

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

  void aiMessages;
  // High-quality only. If no Anthropic key, surface a polished "upgrading"
  // message instead of falling back to a weaker model. Owner adds the key once
  // via: wrangler pages secret put ANTHROPIC_API_KEY --project-name alkinani-site
  if (!env.ANTHROPIC_API_KEY) {
    return upgradingResponse();
  }
  return await streamFromClaude(env, messages, SYSTEM_PROMPT);
};

function upgradingResponse(): Response {
  const text = "نظام علي يحدّث نفسه الحين — رجعلي بعد دقيقة. أو لو مستعجل، واتساب مباشر علي: +966 59 998 8522";
  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  setCORS(headers);
  const body = `event: delta\ndata: ${JSON.stringify({ delta: text })}\n\nevent: done\ndata: ${JSON.stringify({ reason: "upgrading" })}\n\n`;
  return new Response(body, { status: 200, headers });
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/health")) {
    const headers = new Headers({ "Content-Type": "application/json" });
    setCORS(headers);
    return new Response(JSON.stringify({ ok: true, backend: "cf-workers-ai" }), { headers });
  }
  return new Response("not found", { status: 404 });
};

/* --- Anthropic Claude streaming backend ----------------------------------- */

async function streamFromClaude(
  env: Env,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
): Promise<Response> {
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      stream: true,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!apiRes.ok || !apiRes.body) {
    const txt = await apiRes.text().catch(() => "");
    const errPayload = `event: error\ndata: ${JSON.stringify({
      error: `anthropic ${apiRes.status}: ${txt.slice(0, 200)}`,
    })}\n\n`;
    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    setCORS(headers);
    return new Response(errPayload, { status: 200, headers });
  }

  // Anthropic SSE format: event: <name>\ndata: {json}\n\n
  // We extract content_block_delta events and re-emit as our own protocol.
  const transformed = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = apiRes.body!.getReader();
      let buf = "";
      let event = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              event = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (!data) continue;
              try {
                const parsed = JSON.parse(data);
                if (event === "content_block_delta" && parsed?.delta?.type === "text_delta") {
                  const text = parsed.delta.text || "";
                  if (text) {
                    controller.enqueue(
                      encoder.encode(`event: delta\ndata: ${JSON.stringify({ delta: text })}\n\n`),
                    );
                  }
                }
              } catch {
                /* ignore */
              }
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
}
