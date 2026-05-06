// Cloudflare Pages Function: /api/chat
// Streams replies from Cloudflare Workers AI (Llama 3.3 70B Instruct) via SSE.
// No external API key required — uses the AI binding configured by Cloudflare.

interface Env {
  AI: Ai;
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

  const stream = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: aiMessages,
    stream: true,
    max_tokens: 600,
    temperature: 0.55,
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
