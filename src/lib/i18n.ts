export type Lang = "ar" | "en";

export const copy = {
  nav: {
    work: { ar: "الأعمال", en: "Work" },
    method: { ar: "الطريقة", en: "Method" },
    lab: { ar: "العب", en: "Play" },
    tools: { ar: "أدوات", en: "Tools" },
    ask: { ar: "اسألني", en: "Ask" },
    contact: { ar: "تواصل", en: "Contact" },
  },
  hero: {
    eyebrow: { ar: "مؤسس · بنّاء أنظمة · صائد إشارات", en: "Founder · Systems Builder · Signal Hunter" },
    name: { ar: "علي الكناني", en: "Ali Alkinani" },
    transliteration: { ar: "Ali Alkinani", en: "علي الكناني" },
    tagline: {
      ar: "أبني أنظمة ذكاء اصطناعي من منصة بحرية في الخليج.",
      en: "I build AI systems from a marine platform in the Gulf.",
    },
    sub: {
      ar: "خمس سنوات offshore. اثنا عشر ساعة على البحر، اثنا عشر ساعة في البناء.",
      en: "Five years offshore. Twelve hours at sea, twelve hours building.",
    },
    cta: { ar: "شف الأعمال", en: "See the work" },
    scroll: { ar: "اسحب للأسفل", en: "Scroll to begin" },
  },
  origin: {
    section: { ar: "الأصل", en: "Origin" },
    title: {
      ar: "البحر علّمني بناء الأنظمة.",
      en: "The sea taught me how to build systems.",
    },
    body: {
      ar: "خمس سنوات في حقل غاز offshore لأرامكو. بيئة ما فيها مجال للخطأ. النت ضعيف، الوقت محدود، والضغط مستمر. تعلمت أصمم النظام بالكامل قبل ما أبني — المنطق، البنية، التدفق — ثم أوجه أدوات الذكاء الاصطناعي تكتب الكود تحت إشرافي. أراجع، أنشر، أشغّل.",
      en: "Five years on an Aramco offshore gas field. Zero-error environment. Weak internet, limited time, constant pressure. I learned to design the full system first — logic, architecture, flow — then direct AI tools to write code under my supervision. I review, deploy, operate.",
    },
    quote: {
      ar: "كل مشروع بنيته بين شفتين عمل.",
      en: "Every project built between work shifts.",
    },
    stats: [
      { value: "5+", label: { ar: "سنوات في البحر", en: "Years offshore" } },
      { value: "3", label: { ar: "مشاريع ريادية", en: "Ventures founded" } },
      { value: "13", label: { ar: "Cloudflare Worker", en: "Cloudflare Workers" } },
      { value: "24/7", label: { ar: "أنظمة تشتغل بدون تدخّلي", en: "Systems running hands-free" } },
    ],
  },
  ventures: {
    section: { ar: "الأعمال", en: "Ventures" },
    title: {
      ar: "ثلاثة منتجات. عقل واحد يبنيها.",
      en: "Three products. One mind building them.",
    },
    items: [
      {
        index: "01",
        name: { ar: "بذرة", en: "Bithrah" },
        role: { ar: "المؤسس والرئيس التنفيذي", en: "Founder & CEO" },
        url: "bithrah.sa",
        href: "https://bithrah.sa",
        summary: {
          ar: "منصة سعودية لإطلاق الأفكار: عملاء + فريق + مستثمرون في حملة واحدة. حماية فكرية متعددة الطبقات + وكيل ذكاء اصطناعي يحلل الجدوى.",
          en: "Saudi platform to launch ideas: customers + team + investors in one campaign. Multi-layer IP protection + AI feasibility agent.",
        },
        tags: ["Next.js", "FastAPI", "PostgreSQL", "AI Agent"],
        proof: { ar: "165+ تسجيل مبكر · LEAP 2026", en: "165+ early registrations · LEAP 2026" },
      },
      {
        index: "02",
        name: { ar: "كوداد", en: "Codad" },
        role: { ar: "مالك المنتج والمعماري", en: "Product Owner & Architect" },
        url: "codad.co",
        href: "https://codad.co",
        summary: {
          ar: "نظامان في واحد: SaaS لإدارة محتوى السوشيل ميديا بالـ AI + نظام أتمتة شخصي يدير حساباتي وأنا في البحر — 24/7 بدون تدخل.",
          en: "Two systems in one: SaaS for AI social media management + personal automation running my accounts hands-free — 24/7.",
        },
        tags: ["Cloudflare Workers", "D1", "KV", "R2"],
        proof: { ar: "13 Worker · 25 أداة AI · 3 عقول تتنسق", en: "13 Workers · 25 AI tools · 3 brains coordinating" },
      },
      {
        index: "03",
        name: { ar: "سايندرا", en: "Syndra" },
        role: { ar: "مشارك في البناء", en: "Co-Builder" },
        url: "iOS",
        href: null,
        summary: {
          ar: "وكيل ذكاء اصطناعي لـ iOS عبر لوحة مفاتيح مخصصة. يشتغل من أي تطبيق — Gmail، Safari، WhatsApp. مبني على OpenClaw مفتوح المصدر.",
          en: "iOS AI agent via custom keyboard. Works from any app — Gmail, Safari, WhatsApp. Built on open-source OpenClaw.",
        },
        tags: ["Swift", "SwiftUI", "Keyboard Extension"],
        proof: { ar: "iOS · 41 ملف Swift جديد · مقبول في impactU من STC", en: "iOS · 41 new Swift files · Accepted to impactU by STC" },
      },
    ],
  },
  method: {
    section: { ar: "الطريقة", en: "Method" },
    title: {
      ar: "الذكاء الاصطناعي رافعة، مو عكاز.",
      en: "AI is leverage, not a crutch.",
    },
    body: {
      ar: "أصمم. أوجه. أراجع. أنشر. ما أكتب الكود — أكتب القرار. النموذج ينفذ تحت إشرافي.",
      en: "I design. I direct. I review. I ship. I don't write the code — I write the decision. The model executes under supervision.",
    },
    steps: [
      {
        n: "01",
        title: { ar: "تصميم النظام", en: "Design the system" },
        body: {
          ar: "المنطق، البنية، التدفق، حدود الفشل. على ورق قبل أي سطر كود.",
          en: "Logic, architecture, flow, failure boundaries. On paper before any line of code.",
        },
      },
      {
        n: "02",
        title: { ar: "توجيه الـAI", en: "Direct the AI" },
        body: {
          ar: "أعطي تعليمات دقيقة لـ Claude / GPT / Kimi. هم ينفذون بسرعة، أنا أحدد الاتجاه.",
          en: "Precise instructions to Claude / GPT / Kimi. They execute fast — I set the direction.",
        },
      },
      {
        n: "03",
        title: { ar: "مراجعة وإنتاج", en: "Review and ship" },
        body: {
          ar: "كل سطر يمر علي. كل deploy يخرج وأنا متأكد منه. الجودة قبل السرعة.",
          en: "Every line passes through me. Every deploy ships under verification. Quality before speed.",
        },
      },
    ],
  },
  stack: {
    section: { ar: "الأدوات", en: "Stack" },
    title: { ar: "أدوات حادة، استخدام ذكي.", en: "Sharp tools, used precisely." },
    groups: [
      {
        label: { ar: "البنية التحتية", en: "Infrastructure" },
        items: ["Cloudflare Workers", "D1", "KV", "R2", "Firebase"],
      },
      {
        label: { ar: "اللغات والأطر", en: "Languages & Frameworks" },
        items: ["TypeScript", "Python", "Swift", "Next.js", "FastAPI", "SwiftUI"],
      },
      {
        label: { ar: "الذكاء الاصطناعي", en: "Artificial Intelligence" },
        items: ["Claude", "GPT", "Gemini", "Kimi K2", "Ollama (local)", "MCP"],
      },
      {
        label: { ar: "العمليات", en: "Operations" },
        items: ["Aramco offshore (5y)", "High-pressure environments", "Systems thinking"],
      },
    ],
  },
  contact: {
    section: { ar: "تواصل", en: "Contact" },
    title: {
      ar: "إذا كان عندك مشروع جدّي، خذ اتصال.",
      en: "If you have a serious project, reach out.",
    },
    sub: {
      ar: "اكتب لي عن المشروع — وش تبني، لمين، وفي أي مرحلة. كل ما الصورة وضحت، الرد أنفع.",
      en: "Tell me the whole story — what you're building, for whom, what stage. The clearer the story, the more useful the reply.",
    },
    channels: [
      { label: "Email", value: "ali.alshehri.ar@gmail.com", href: "mailto:ali.alshehri.ar@gmail.com" },
      { label: "WhatsApp", value: "+966 59 998 8522", href: "https://wa.me/966599988522" },
      { label: "X", value: "@o0a98", href: "https://x.com/o0a98" },
      { label: "LinkedIn", value: "ali-saeed-alshehri-ar", href: "https://www.linkedin.com/in/ali-saeed-alshehri-ar/" },
      { label: "Bithrah", value: "bithrah.sa", href: "https://bithrah.sa" },
    ],
  },
  footer: {
    line1: { ar: "صُمم وبُني بواسطة علي الكناني.", en: "Designed and built by Ali Alkinani." },
    line2: { ar: "من البحر. إلى العالم.", en: "From the sea. To the world." },
  },
} as const;

export function t<T extends { ar: string; en: string }>(value: T, lang: Lang): string {
  return value[lang];
}
