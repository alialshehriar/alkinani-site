// Pre-baked Saudi-flavoured pitch scenarios for the Pressure Test mini-game.
// Each scenario gives the player a "ready idea" they can pick from when they're stuck.
// They can also write their own.

export type Scenario = {
  id: string;
  category: "tech" | "retail" | "food" | "service" | "edtech" | "fintech";
  ar: string;
  en: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "coffee-sub",
    category: "food",
    ar: "تطبيق اشتراك شهري يوصّل بن مختص للبيت في الرياض وجدة.",
    en: "Monthly subscription delivering specialty coffee beans in Riyadh and Jeddah.",
  },
  {
    id: "ar-tutor",
    category: "edtech",
    ar: "مدرّس AI خصوصي يتكلّم نجدي ويشرح المنهج السعودي للأطفال.",
    en: "Private AI tutor that speaks Najdi and teaches the Saudi K-12 curriculum.",
  },
  {
    id: "salla-pos",
    category: "retail",
    ar: "نظام نقاط بيع للمحلات الصغيرة يطلع تقارير ضريبة بيكفيك جاي.",
    en: "Point-of-sale for small Saudi shops that auto-files VAT returns.",
  },
  {
    id: "freelance-hr",
    category: "service",
    ar: "منصة سعودية تربط الشركات بمصممي جرافيك بالساعة (ما هي fiverr).",
    en: "A Saudi-first platform that books graphic designers by the hour, not by gig.",
  },
  {
    id: "fintech-savings",
    category: "fintech",
    ar: "تطبيق ادخار آلي يقتطع 2 ريال من كل عملية شراء ويستثمرها في صكوك.",
    en: "Auto-savings app that rounds up purchases and invests the change into Sukuk.",
  },
  {
    id: "ai-mins",
    category: "tech",
    ar: "أداة AI تلخص اجتماعات Zoom بالعربي وترسل قائمة مهام على واتساب.",
    en: "AI tool that summarizes Zoom meetings in Arabic and pushes action items to WhatsApp.",
  },
  {
    id: "neighbor-grocer",
    category: "retail",
    ar: "تطبيق بقالة الحي: تطلب من بقّال جنبك ويوصل خلال 15 دقيقة.",
    en: "Neighborhood grocer app: order from the corner shop, delivered in 15 minutes.",
  },
  {
    id: "iot-mosque",
    category: "service",
    ar: "نظام IoT للمساجد: مكيفات تنطفي تلقائياً بعد الصلاة، توفير ٢٠٪ كهرباء.",
    en: "IoT for mosques: AC turns off automatically after prayer — 20% power saving.",
  },
];

export function pickScenario(seed?: number): Scenario {
  const i =
    typeof seed === "number"
      ? seed % SCENARIOS.length
      : Math.floor(Math.random() * SCENARIOS.length);
  return SCENARIOS[i];
}
