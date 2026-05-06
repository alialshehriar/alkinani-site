// Reflex Lab — 7-card rapid-fire founder dilemma game.
// Each card is a binary "no wrong answer" dilemma. The user's choices map to
// axes that compose their "founder DNA" profile.

export type Axis =
  | "speed-vs-craft"      // ship fast vs ship right
  | "product-vs-market"   // build first vs sell first
  | "data-vs-intuition"   // measure vs trust gut
  | "scale-vs-niche"      // mass market vs deep niche
  | "solo-vs-team"        // small + sharp vs big + diverse
  | "open-vs-stealth"     // build in public vs build in private
  | "now-vs-future";      // optimize today vs bet on tomorrow

export type CardOption = {
  label: { ar: string; en: string };
  axis: Axis;
  side: "A" | "B"; // which side of the axis this option pushes toward
  emoji?: string;
};

export type Card = {
  id: string;
  prompt: { ar: string; en: string };
  category: { ar: string; en: string };
  emoji: string;
  options: [CardOption, CardOption]; // exactly 2
};

export const CARDS: Card[] = [
  {
    id: "ship-now",
    emoji: "⚡",
    category: { ar: "إصدار", en: "Release" },
    prompt: {
      ar: "المنتج جاهز ٨٠٪. الحدث الكبير بكرة. وش تسوي؟",
      en: "The product is 80% ready. Big event tomorrow. What do you do?",
    },
    options: [
      { label: { ar: "أطلق الحين", en: "Ship now" }, axis: "speed-vs-craft", side: "A", emoji: "🚀" },
      { label: { ar: "أأجل وأكمّل", en: "Delay and polish" }, axis: "speed-vs-craft", side: "B", emoji: "🛠️" },
    ],
  },
  {
    id: "code-first",
    emoji: "🧱",
    category: { ar: "بداية", en: "Day 0" },
    prompt: {
      ar: "أول يوم في فكرة جديدة. وش تبدأ؟",
      en: "Day 1 of a new idea. Where do you start?",
    },
    options: [
      { label: { ar: "أبني نموذج أولي", en: "Build a prototype" }, axis: "product-vs-market", side: "A", emoji: "💻" },
      { label: { ar: "أكلّم ١٠ عملاء", en: "Talk to 10 customers" }, axis: "product-vs-market", side: "B", emoji: "🗣️" },
    ],
  },
  {
    id: "metric-vs-feel",
    emoji: "📊",
    category: { ar: "قرار", en: "Decision" },
    prompt: {
      ar: "خاصية جديدة. الأرقام ضعيفة بس حدسك يقول تنفع. وش تختار؟",
      en: "New feature. Numbers say no, gut says yes. Which wins?",
    },
    options: [
      { label: { ar: "أحترم البيانات", en: "Trust the data" }, axis: "data-vs-intuition", side: "A", emoji: "📐" },
      { label: { ar: "أتبع حدسي", en: "Follow the gut" }, axis: "data-vs-intuition", side: "B", emoji: "🧠" },
    ],
  },
  {
    id: "broad-vs-deep",
    emoji: "🎯",
    category: { ar: "سوق", en: "Market" },
    prompt: {
      ar: "تختار: مليون مستخدم بحاجة بسيطة، ولا ١٠٠ مستخدم بحاجة عميقة؟",
      en: "Pick: 1M users with shallow need, or 100 users with a burning one?",
    },
    options: [
      { label: { ar: "المليون", en: "The million" }, axis: "scale-vs-niche", side: "A", emoji: "🌍" },
      { label: { ar: "المئة المهووسين", en: "The 100 obsessed" }, axis: "scale-vs-niche", side: "B", emoji: "🔥" },
    ],
  },
  {
    id: "team-size",
    emoji: "👥",
    category: { ar: "فريق", en: "Team" },
    prompt: {
      ar: "ميزانية لتوظيف. وش تختار؟",
      en: "Budget to hire. Which way?",
    },
    options: [
      { label: { ar: "٢ خارقين", en: "2 elite" }, axis: "solo-vs-team", side: "A", emoji: "🦅" },
      { label: { ar: "٦ متوسطين", en: "6 solid" }, axis: "solo-vs-team", side: "B", emoji: "🐝" },
    ],
  },
  {
    id: "build-public",
    emoji: "🪟",
    category: { ar: "إعلان", en: "Visibility" },
    prompt: {
      ar: "تطلق المشروع كيف؟",
      en: "How do you launch?",
    },
    options: [
      { label: { ar: "علني من اليوم الأول", en: "Loud from day one" }, axis: "open-vs-stealth", side: "A", emoji: "📣" },
      { label: { ar: "بصمت لين يجهز", en: "Quiet until it's ready" }, axis: "open-vs-stealth", side: "B", emoji: "🤫" },
    ],
  },
  {
    id: "today-vs-future",
    emoji: "⏳",
    category: { ar: "وقت", en: "Time" },
    prompt: {
      ar: "وش الأهم؟",
      en: "What matters more?",
    },
    options: [
      { label: { ar: "أقوى نسخة اليوم", en: "Strongest version today" }, axis: "now-vs-future", side: "A", emoji: "💎" },
      { label: { ar: "خط أساس لخمس سنين", en: "Foundation for 5 years" }, axis: "now-vs-future", side: "B", emoji: "🏛️" },
    ],
  },
  {
    id: "investor-meeting",
    emoji: "💼",
    category: { ar: "مستثمر", en: "Investor" },
    prompt: {
      ar: "مستثمر طلب اجتماع. الـpitch مو جاهز ١٠٠٪.",
      en: "Investor wants a meeting. Pitch isn't 100% ready.",
    },
    options: [
      { label: { ar: "أوافق هاليوم", en: "Take it today" }, axis: "speed-vs-craft", side: "A", emoji: "🤝" },
      { label: { ar: "أأجل ٣ أيام", en: "Delay 3 days" }, axis: "speed-vs-craft", side: "B", emoji: "📅" },
    ],
  },
  {
    id: "feature-vs-fix",
    emoji: "🐛",
    category: { ar: "أولوية", en: "Priority" },
    prompt: {
      ar: "في باغ يزعج ٢٪، وميزة تكسبك ٢٠٪ نمو. وش الأول؟",
      en: "Bug bothers 2%, feature could grow 20%. Which first?",
    },
    options: [
      { label: { ar: "الباغ", en: "Fix the bug" }, axis: "speed-vs-craft", side: "B", emoji: "🛠️" },
      { label: { ar: "الميزة", en: "Ship the feature" }, axis: "speed-vs-craft", side: "A", emoji: "🌱" },
    ],
  },
  {
    id: "pricing",
    emoji: "💸",
    category: { ar: "تسعير", en: "Pricing" },
    prompt: {
      ar: "وش تسعّر؟",
      en: "How do you price?",
    },
    options: [
      { label: { ar: "أرخص ٣٠٪ من السوق", en: "30% cheaper" }, axis: "scale-vs-niche", side: "A", emoji: "🏷️" },
      { label: { ar: "أغلى ٢x لأنك أحسن", en: "2× because you're better" }, axis: "scale-vs-niche", side: "B", emoji: "👑" },
    ],
  },
  {
    id: "automation",
    emoji: "🤖",
    category: { ar: "أتمتة", en: "Automation" },
    prompt: {
      ar: "خدمة عميل. ٤٠ تذكرة كل يوم. وش الأنسب؟",
      en: "Support tickets: 40/day. What's right?",
    },
    options: [
      { label: { ar: "AI يرد على ٧٠٪", en: "AI handles 70%" }, axis: "data-vs-intuition", side: "A", emoji: "⚡" },
      { label: { ar: "بشري يرد على الكل", en: "Human handles all" }, axis: "data-vs-intuition", side: "B", emoji: "❤️" },
    ],
  },
  {
    id: "side-project",
    emoji: "🎲",
    category: { ar: "مغامرة", en: "Bet" },
    prompt: {
      ar: "فكرة جانبية ممتازة بس بعيدة عن نشاطك. تشتغل عليها؟",
      en: "Killer side idea, far from your core. Do you build it?",
    },
    options: [
      { label: { ar: "أركز على نشاطي", en: "Stay focused" }, axis: "now-vs-future", side: "A", emoji: "🎯" },
      { label: { ar: "أجرّبها في الجمعة", en: "Try it on Fridays" }, axis: "now-vs-future", side: "B", emoji: "🌌" },
    ],
  },
  {
    id: "compete",
    emoji: "⚔️",
    category: { ar: "منافس", en: "Rival" },
    prompt: {
      ar: "منافس كبير دخل سوقك. وش الأنسب؟",
      en: "A giant just entered your market.",
    },
    options: [
      { label: { ar: "أنزل عميق في سوق صغير", en: "Go deeper, narrower" }, axis: "scale-vs-niche", side: "B", emoji: "🐠" },
      { label: { ar: "أتوسع بسرعة", en: "Sprint to scale" }, axis: "scale-vs-niche", side: "A", emoji: "🐋" },
    ],
  },
  {
    id: "feedback",
    emoji: "📝",
    category: { ar: "ردود", en: "Feedback" },
    prompt: {
      ar: "عميل كاره. ينشر شكوى علنية. وش تسوي؟",
      en: "Angry customer posts publicly.",
    },
    options: [
      { label: { ar: "أرد علني وأحلّها", en: "Reply publicly" }, axis: "open-vs-stealth", side: "A", emoji: "🪟" },
      { label: { ar: "أحلّها بمكالمة هاتف", en: "Call them privately" }, axis: "open-vs-stealth", side: "B", emoji: "📞" },
    ],
  },
  {
    id: "hire-junior",
    emoji: "🎓",
    category: { ar: "توظيف", en: "Hire" },
    prompt: {
      ar: "مرشّح جونيور موهوب جداً، ولا سنيور بخبرة سنتين؟",
      en: "Brilliant junior, or solid 2-yr senior?",
    },
    options: [
      { label: { ar: "الجونيور الموهوب", en: "Bet on the junior" }, axis: "now-vs-future", side: "B", emoji: "🌱" },
      { label: { ar: "السنيور الموثوق", en: "Take the senior" }, axis: "now-vs-future", side: "A", emoji: "🪨" },
    ],
  },
];

export function pickRandomCards(count: number): Card[] {
  // Fisher-Yates over a copy
  const copy = [...CARDS];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

export type Choice = { cardId: string; side: "A" | "B" };

export function summarizeAxes(cards: Card[], choices: Choice[]): Record<Axis, number> {
  const sums: Record<Axis, number> = {
    "speed-vs-craft": 0,
    "product-vs-market": 0,
    "data-vs-intuition": 0,
    "scale-vs-niche": 0,
    "solo-vs-team": 0,
    "open-vs-stealth": 0,
    "now-vs-future": 0,
  };
  const counts: Record<Axis, number> = { ...sums };
  for (const choice of choices) {
    const card = cards.find((c) => c.id === choice.cardId);
    if (!card) continue;
    const opt = card.options.find((o) => o.side === choice.side);
    if (!opt) continue;
    counts[opt.axis] = (counts[opt.axis] ?? 0) + 1;
    // A = +1, B = -1 (signed lean)
    sums[opt.axis] = (sums[opt.axis] ?? 0) + (opt.side === "A" ? 1 : -1);
  }
  // Normalize to -1..1 lean
  const out: Record<Axis, number> = { ...sums };
  for (const k of Object.keys(sums) as Axis[]) {
    const c = counts[k] || 0;
    out[k] = c === 0 ? 0 : sums[k] / c;
  }
  return out;
}
