// Tech Sprint — 60-second multiple-choice speed quiz.
// Categories: AI fundamentals, Saudi tech ecosystem, founder economics, building.

export type QuizCategory = "ai" | "saudi" | "founder" | "stack";

export type QuizQuestion = {
  id: string;
  category: QuizCategory;
  ar: { q: string; choices: [string, string, string, string]; correct: 0 | 1 | 2 | 3; fact?: string };
  en: { q: string; choices: [string, string, string, string]; correct: 0 | 1 | 2 | 3; fact?: string };
};

export const QUESTIONS: QuizQuestion[] = [
  {
    id: "llm-core",
    category: "ai",
    ar: {
      q: "وش يسوّي LLM في جوهره؟",
      choices: [
        "يتنبأ بالـtoken الجاي",
        "يفهم المعنى مثل البشر",
        "يبحث في الإنترنت",
        "يخزن كل المعلومات",
      ],
      correct: 0,
      fact: "النموذج يحسب احتمال كل token تالي ويختار. هذا كل شي.",
    },
    en: {
      q: "What does an LLM do at its core?",
      choices: ["predicts the next token", "understands like humans", "searches the web", "stores all knowledge"],
      correct: 0,
      fact: "The model computes probabilities over the next token. That's it.",
    },
  },
  {
    id: "vision-2030-smes",
    category: "saudi",
    ar: {
      q: "هدف رؤية 2030 لمساهمة الشركات الصغيرة والمتوسطة في الناتج المحلي؟",
      choices: ["20%", "35%", "50%", "10%"],
      correct: 1,
      fact: "هدف 2030 رفع مساهمة SMEs من 20% إلى 35%.",
    },
    en: {
      q: "Vision 2030 target for SME contribution to GDP?",
      choices: ["20%", "35%", "50%", "10%"],
      correct: 1,
      fact: "The goal is to lift SME contribution from 20% to 35%.",
    },
  },
  {
    id: "cac-meaning",
    category: "founder",
    ar: {
      q: "وش تعني CAC؟",
      choices: [
        "التكلفة لاكتساب عميل",
        "متوسط الإيراد لكل عميل",
        "السقف على رأس المال",
        "حساب رأس المال للنمو",
      ],
      correct: 0,
      fact: "CAC = Customer Acquisition Cost. لو CAC > LTV، خسران.",
    },
    en: {
      q: "What does CAC mean?",
      choices: ["customer acquisition cost", "cap on cash", "capital allocation chart", "cumulative average cost"],
      correct: 0,
      fact: "CAC = Customer Acquisition Cost. If CAC > LTV, you're losing money.",
    },
  },
  {
    id: "context-window",
    category: "ai",
    ar: {
      q: "وش هي الـcontext window في LLM؟",
      choices: [
        "حجم الذاكرة الفعلية للنموذج",
        "أكبر عدد tokens يقدر يعالجها مرة وحدة",
        "عدد المستخدمين المتزامنين",
        "سعر الاشتراك",
      ],
      correct: 1,
      fact: "Claude 4.7 وصل 1M token. يعني ~750K كلمة دفعة وحدة.",
    },
    en: {
      q: "What is an LLM's context window?",
      choices: ["the model's RAM", "max tokens it can process at once", "concurrent users", "subscription tier"],
      correct: 1,
      fact: "Claude 4.7 hit 1M tokens — about 750K words in one shot.",
    },
  },
  {
    id: "leap-2026",
    category: "saudi",
    ar: {
      q: "LEAP 2026 — أكبر مؤتمر تقني في وش؟",
      choices: ["السعودية", "الإمارات", "الكويت", "قطر"],
      correct: 0,
      fact: "LEAP في الرياض. أكبر تجمّع تقني في المنطقة.",
    },
    en: {
      q: "LEAP 2026 — region's biggest tech event held in?",
      choices: ["Saudi Arabia", "UAE", "Kuwait", "Qatar"],
      correct: 0,
      fact: "LEAP is held in Riyadh — the region's largest tech gathering.",
    },
  },
  {
    id: "burn-rate",
    category: "founder",
    ar: {
      q: "وش يعني burn rate؟",
      choices: [
        "سرعة نموّك",
        "الكاش اللي تصرفه شهرياً",
        "نسبة الـchurn",
        "تكلفة المنتج",
      ],
      correct: 1,
      fact: "Burn rate = الفلوس اللي تختفي شهرياً. Cash / burn = runway.",
    },
    en: {
      q: "What is burn rate?",
      choices: ["growth speed", "monthly cash you spend", "churn rate", "product cost"],
      correct: 1,
      fact: "Burn rate = cash you spend per month. Cash / burn = runway.",
    },
  },
  {
    id: "cf-workers",
    category: "stack",
    ar: {
      q: "Cloudflare Workers تشتغل وين؟",
      choices: [
        "على سيرفر واحد في أمريكا",
        "في +300 موقع حول العالم (edge)",
        "على جهازك",
        "في AWS فقط",
      ],
      correct: 1,
      fact: "Workers تشتغل عند المستخدم — latency أقل من 50ms عالمياً.",
    },
    en: {
      q: "Where do Cloudflare Workers run?",
      choices: ["one US server", "300+ edge locations worldwide", "your device", "AWS only"],
      correct: 1,
      fact: "Workers run near the user — sub-50ms latency globally.",
    },
  },
  {
    id: "mvp-purpose",
    category: "founder",
    ar: {
      q: "الهدف الأساسي من MVP؟",
      choices: [
        "أرخص نسخة ممكنة",
        "تتعلّم أسرع شي",
        "أكبر سوق ممكن",
        "أكثر ميزات ممكنة",
      ],
      correct: 1,
      fact: "MVP = Minimum Viable Product. الهدف التعلّم، مو الإيراد.",
    },
    en: {
      q: "Main purpose of an MVP?",
      choices: ["cheapest version", "fastest learning", "biggest market", "most features"],
      correct: 1,
      fact: "MVP = Minimum Viable Product. The goal is learning, not revenue.",
    },
  },
  {
    id: "rag-meaning",
    category: "ai",
    ar: {
      q: "RAG في AI تعني؟",
      choices: [
        "Real-time AI Generation",
        "Retrieval-Augmented Generation",
        "Random Access Generator",
        "Recursive AI Graph",
      ],
      correct: 1,
      fact: "RAG = جلب وثائق ذات صلة + توليد جواب من النموذج. حلّ الـhallucination.",
    },
    en: {
      q: "What does RAG mean in AI?",
      choices: [
        "Real-time AI Generation",
        "Retrieval-Augmented Generation",
        "Random Access Generator",
        "Recursive AI Graph",
      ],
      correct: 1,
      fact: "RAG = retrieve relevant docs + generate answer. Cure for hallucination.",
    },
  },
  {
    id: "saudi-startup-rank",
    category: "saudi",
    ar: {
      q: "السعودية تصدّرت العالم العربي في تمويل التقنية في؟",
      choices: ["2019", "2021", "2023", "بعدها ما تصدّرت"],
      correct: 2,
      fact: "السعودية تجاوزت الإمارات في تمويل التقنية في 2023.",
    },
    en: {
      q: "Saudi led MENA tech funding starting which year?",
      choices: ["2019", "2021", "2023", "still hasn't"],
      correct: 2,
      fact: "Saudi overtook the UAE in tech funding in 2023.",
    },
  },
  {
    id: "embedding-purpose",
    category: "ai",
    ar: {
      q: "الـembedding في AI يحول النص إلى؟",
      choices: [
        "صورة",
        "متجه أرقام يمثل المعنى",
        "ملخص",
        "ترجمة",
      ],
      correct: 1,
      fact: "Embedding = vector معاني. كلمتين متشابهتين → vectors قريبة.",
    },
    en: {
      q: "An embedding turns text into?",
      choices: ["an image", "a vector representing meaning", "a summary", "a translation"],
      correct: 1,
      fact: "Embedding = a meaning vector. Similar words land close together.",
    },
  },
  {
    id: "ltv-cac-ratio",
    category: "founder",
    ar: {
      q: "نسبة LTV:CAC الصحية للـSaaS؟",
      choices: ["1:1", "3:1 أو أعلى", "1:3", "10:1"],
      correct: 1,
      fact: "3:1 معيار صحي. أقل من ذلك = الاقتصاد عاطل.",
    },
    en: {
      q: "Healthy LTV:CAC ratio for SaaS?",
      choices: ["1:1", "3:1 or higher", "1:3", "10:1"],
      correct: 1,
      fact: "3:1 is the healthy benchmark. Below that = broken unit economics.",
    },
  },
  {
    id: "pmf",
    category: "founder",
    ar: {
      q: "Product-Market Fit أول علامة عليها؟",
      choices: [
        "تمويل ضخم",
        "نمو عضوي بدون تسويق",
        "تغطية إعلامية",
        "100K مستخدم",
      ],
      correct: 1,
      fact: "PMF = العملاء يجيبون عملاء آخرين بدون ما تدفع للتسويق.",
    },
    en: {
      q: "First sign of Product-Market Fit?",
      choices: ["a big round", "organic growth without marketing", "press coverage", "100k users"],
      correct: 1,
      fact: "PMF = users bring more users without paid acquisition.",
    },
  },
  {
    id: "kacst",
    category: "saudi",
    ar: {
      q: "KACST تعني؟",
      choices: [
        "هيئة الاتصالات وتقنية المعلومات",
        "مدينة الملك عبدالعزيز للعلوم والتقنية",
        "صندوق التنمية الصناعية",
        "وزارة الاتصالات",
      ],
      correct: 1,
      fact: "KACST: مدينة الملك عبدالعزيز للعلوم والتقنية — بحوث + ابتكار.",
    },
    en: {
      q: "What does KACST stand for?",
      choices: [
        "Comms regulator",
        "King Abdulaziz City for Science & Tech",
        "Industrial Dev Fund",
        "Ministry of Comms",
      ],
      correct: 1,
      fact: "KACST: King Abdulaziz City for Science & Technology — Saudi's R&D hub.",
    },
  },
  {
    id: "fine-tune-vs-prompt",
    category: "ai",
    ar: {
      q: "متى تستخدم fine-tuning بدل prompt engineering؟",
      choices: [
        "لكل المهام",
        "لما الـprompt ما يكفي ولديك ١٠٠+ أمثلة",
        "أبداً، الـprompt يكفي دايم",
        "للأسئلة الحسابية",
      ],
      correct: 1,
      fact: "ابدأ دايم بـprompt. fine-tune بس لما يكون عندك data + الـprompt محدود.",
    },
    en: {
      q: "When to fine-tune over prompt engineering?",
      choices: [
        "always",
        "when prompts hit a wall and you have 100+ examples",
        "never, prompts always suffice",
        "for math questions",
      ],
      correct: 1,
      fact: "Always start with prompts. Fine-tune only when you have data and prompts plateau.",
    },
  },
  {
    id: "monorepo",
    category: "stack",
    ar: {
      q: "الـmonorepo فايدته الأساسية؟",
      choices: [
        "أسرع في الـdeployment",
        "كود مشترك بدون نشر بكج",
        "أرخص cloud bill",
        "أمان أكبر",
      ],
      correct: 1,
      fact: "Monorepo = شيرنق كود + types مباشرة بين الـapps بدون publish.",
    },
    en: {
      q: "Main benefit of a monorepo?",
      choices: ["faster deploys", "share code without publishing packages", "cheaper hosting", "better security"],
      correct: 1,
      fact: "Monorepo = share code & types directly between apps without publishing.",
    },
  },
  {
    id: "north-star",
    category: "founder",
    ar: {
      q: "North Star Metric — وش هو؟",
      choices: [
        "إيرادك الشهري",
        "المقياس الواحد اللي يلخّص قيمتك للعميل",
        "عدد الموظفين",
        "حجم الـround",
      ],
      correct: 1,
      fact: "North Star = الرقم الواحد اللي لو كبر يعني نجحت. مثل 'دقايق المشاهدة' عند YouTube.",
    },
    en: {
      q: "What's a North Star Metric?",
      choices: [
        "monthly revenue",
        "the one number that captures the value you deliver",
        "headcount",
        "round size",
      ],
      correct: 1,
      fact: "North Star = the one metric whose growth means you're winning. Like YouTube's watch-time.",
    },
  },
  {
    id: "moyasar",
    category: "saudi",
    ar: {
      q: "Moyasar في السوق السعودي تخدم؟",
      choices: [
        "توصيل طلبات",
        "بوابة دفع للـecommerce",
        "تحويلات بنكية",
        "مدفوعات حكومية",
      ],
      correct: 1,
      fact: "Moyasar — مزود دفع سعودي مرخّص من ساما. يخدم آلاف المتاجر.",
    },
    en: {
      q: "Moyasar serves what in the Saudi market?",
      choices: ["food delivery", "payment gateway for ecommerce", "bank transfers", "gov payments"],
      correct: 1,
      fact: "Moyasar — SAMA-licensed Saudi payment gateway used by thousands of stores.",
    },
  },
  {
    id: "tokens",
    category: "ai",
    ar: {
      q: "كم تساوي تقريباً ١٠٠ token باللغة الإنجليزية؟",
      choices: ["١٠ كلمات", "٧٥ كلمة", "٢٠٠ كلمة", "كلمتين"],
      correct: 1,
      fact: "1 token ≈ 0.75 كلمة إنجليزية. عربي أكثر — حرفين-ثلاثة لكل token.",
    },
    en: {
      q: "How many words is roughly 100 tokens in English?",
      choices: ["10 words", "75 words", "200 words", "2 words"],
      correct: 1,
      fact: "1 token ≈ 0.75 English words. Arabic uses 2-3× more tokens per word.",
    },
  },
  {
    id: "salla-vs-zid",
    category: "saudi",
    ar: {
      q: "Salla و Zid كلتيهن منصات؟",
      choices: [
        "توصيل طعام",
        "إنشاء متاجر إلكترونية",
        "تأمين سيارات",
        "تعليم عبر الإنترنت",
      ],
      correct: 1,
      fact: "Salla و Zid — منصتان سعوديتان لإنشاء وإدارة المتاجر الإلكترونية.",
    },
    en: {
      q: "Salla and Zid are platforms for?",
      choices: ["food delivery", "building ecommerce stores", "car insurance", "online education"],
      correct: 1,
      fact: "Salla and Zid — two Saudi platforms for creating and running ecommerce stores.",
    },
  },
  {
    id: "stripe-atlas",
    category: "founder",
    ar: {
      q: "Stripe Atlas يخدم؟",
      choices: [
        "خرائط لـUber",
        "تأسيس شركة في Delaware عن بعد",
        "تحليل ضريبي",
        "تسويق",
      ],
      correct: 1,
      fact: "Stripe Atlas — خدمة تأسيس C-Corp في Delaware في أيام مع EIN وحساب بنكي.",
    },
    en: {
      q: "Stripe Atlas helps you?",
      choices: ["map your routes", "incorporate a Delaware company remotely", "file taxes", "do marketing"],
      correct: 1,
      fact: "Stripe Atlas — incorporates a Delaware C-Corp in days, including EIN and bank account.",
    },
  },
  {
    id: "agentic-ai",
    category: "ai",
    ar: {
      q: "Agentic AI الفرق الرئيسي عن chatbot عادي؟",
      choices: [
        "أسرع ردود",
        "يستخدم أدوات (tools) ويتخذ قرارات متعددة الخطوات",
        "أرخص",
        "بدون internet",
      ],
      correct: 1,
      fact: "Agentic = AI يخطط، ينفذ خطوات، يستخدم tools (search/code/api) بدون توجيه كل خطوة.",
    },
    en: {
      q: "Agentic AI key difference from a chatbot?",
      choices: ["faster replies", "uses tools and makes multi-step decisions", "cheaper", "no internet"],
      correct: 1,
      fact: "Agentic = AI plans, executes steps, uses tools (search/code/api) without per-step prompts.",
    },
  },
  {
    id: "tdd-meaning",
    category: "stack",
    ar: {
      q: "TDD تعني؟",
      choices: [
        "Test-Driven Development",
        "Type-Driven Design",
        "Top-Down Deployment",
        "Total Data Delivery",
      ],
      correct: 0,
      fact: "TDD = اكتب الـtest أول، وبعدين الكود اللي ينجحه. ضد الـbug-loop.",
    },
    en: {
      q: "TDD stands for?",
      choices: ["Test-Driven Development", "Type-Driven Design", "Top-Down Deployment", "Total Data Delivery"],
      correct: 0,
      fact: "TDD = write the failing test first, then write the code that passes it.",
    },
  },
  {
    id: "saudi-internet",
    category: "saudi",
    ar: {
      q: "نسبة انتشار الإنترنت في السعودية تقريباً؟",
      choices: ["75%", "85%", "95%+", "60%"],
      correct: 2,
      fact: "السعودية من أعلى دول العالم في انتشار الإنترنت — قرب ١٠٠٪.",
    },
    en: {
      q: "Saudi internet penetration is roughly?",
      choices: ["75%", "85%", "95%+", "60%"],
      correct: 2,
      fact: "Saudi Arabia has near-universal internet penetration — among the world's highest.",
    },
  },
  {
    id: "founder-mode",
    category: "founder",
    ar: {
      q: "Paul Graham 'Founder Mode' الفكرة الرئيسية؟",
      choices: [
        "تفويض كل شي للمدراء",
        "البقاء قريب من التفاصيل + skip-level أوسع",
        "العمل سولو دايم",
        "زيادة عدد المدراء",
      ],
      correct: 1,
      fact: "Founder Mode (PG، 2024) = المؤسس يبقى في التفاصيل ويتجاوز الـmanagement chain.",
    },
    en: {
      q: "Paul Graham's 'Founder Mode' core idea?",
      choices: [
        "delegate everything",
        "stay close to detail + skip levels",
        "always work solo",
        "hire more managers",
      ],
      correct: 1,
      fact: "Founder Mode (PG, 2024) = the founder stays in the details and skips the mgmt chain.",
    },
  },
];

export function pickQuestions(count: number): QuizQuestion[] {
  const copy = [...QUESTIONS];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}
