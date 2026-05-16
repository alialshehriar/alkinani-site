import { motion } from "motion/react";
import type { Lang } from "../lib/i18n";

type Props = { lang: Lang };

const TOOLS = [
  {
    id: "turjuman",
    href: "/tools/turjuman",
    eyebrow: { ar: "ترجمة", en: "Translation" },
    titleAr: "ترجمان",
    titleEn: "Turjuman",
    body: {
      ar: "الصق رابط فيديو أو ارفع ملف، استلم الفيديو نفسه مع الترجمة محروقة عليه. يفهم السياق، ويحترم النحو، ويلتزم بمعايير Netflix للترجمة.",
      en: "Paste a video link or upload a file. Get the video back with translated subtitles burned in — context-aware, syntax-respecting, Netflix-grade formatting.",
    },
    badges: { ar: ["جديد", "٥ دقايق مجاناً"], en: ["New", "5 free minutes"] },
    accent: "ember" as const,
    icon: "▶",
    external: false,
  },
  {
    id: "radar",
    href: "/#radar",
    eyebrow: { ar: "أخبار", en: "Signals" },
    titleAr: "رادار",
    titleEn: "Radar",
    body: {
      ar: "آخر إشارات الذكاء الاصطناعي من Reddit + Hacker News + GitHub + Product Hunt، مفسّرة بالعربي، محدّثة كل ٤ دقائق.",
      en: "Latest AI signals from Reddit + Hacker News + GitHub + Product Hunt, translated to Arabic, refreshed every 4 minutes.",
    },
    badges: { ar: ["مباشر"], en: ["Live"] },
    accent: "tide" as const,
    icon: "◉",
    external: false,
  },
];

export default function Tools({ lang }: Props) {
  const isAr = lang === "ar";
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink-950 text-ink-100">
      {/* Ambient gradient backdrop, like Hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, color-mix(in oklab, var(--color-ember-500) 18%, transparent) 0%, transparent 55%), radial-gradient(ellipse at 70% 100%, color-mix(in oklab, var(--color-tide-500) 14%, transparent) 0%, transparent 60%)",
        }}
      />

      <section className="mx-auto max-w-4xl px-6 pt-32 pb-20 sm:px-12 sm:pt-40">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <p className="mb-4 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.3em] text-ember-500/80">
            <span className="h-px w-7 bg-ember-500/70" />
            {isAr ? "أدوات" : "Tools"}
            <span className="h-px w-7 bg-ember-500/70" />
          </p>
          <h1 className="text-5xl font-medium tracking-tight sm:text-6xl">
            {isAr ? "أدوات بنيتُها لأنفسي" : "Tools I built for myself"}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
            {isAr
              ? "كل أداة هنا مشكلة شخصية حلّيتها بالكود والذكاء الاصطناعي، ثم فتحتها للعالم."
              : "Each tool here is a personal problem I solved with code + AI, then opened to the world."}
          </p>
        </motion.header>

        <div className="mt-16 grid gap-5 sm:grid-cols-2">
          {TOOLS.map((t, i) => (
            <motion.a
              key={t.id}
              href={t.href}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.55,
                delay: 0.18 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              data-cursor="hover"
              className={`group relative overflow-hidden rounded-3xl border border-ink-800/70 bg-ink-900/40 p-7 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-${t.accent}-500/60 hover:bg-ink-900/60 sm:p-8`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl border border-${t.accent}-500/30 bg-${t.accent}-500/10 text-lg text-${t.accent}-400`}
                >
                  {t.icon}
                </span>
                <div className="flex flex-wrap justify-end gap-2">
                  {(isAr ? t.badges.ar : t.badges.en).map((b) => (
                    <span
                      key={b}
                      className={`rounded-full border border-${t.accent}-500/30 bg-${t.accent}-500/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-${t.accent}-400`}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              <p className="mt-7 text-[10px] uppercase tracking-[0.3em] text-ink-500">
                {isAr ? t.eyebrow.ar : t.eyebrow.en}
              </p>
              <h3 className="mt-1 flex items-baseline gap-3 text-3xl font-medium tracking-tight">
                <span>{isAr ? t.titleAr : t.titleEn}</span>
                <span dir="ltr" className="text-xs text-ink-500">
                  {isAr ? t.titleEn : t.titleAr}
                </span>
              </h3>
              <p className="mt-3 leading-relaxed text-ink-300">
                {isAr ? t.body.ar : t.body.en}
              </p>

              <div className="mt-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-400 transition group-hover:text-ember-400">
                {isAr ? "ادخل الأداة" : "Open the tool"}
                <span>{isAr ? "←" : "→"}</span>
              </div>
            </motion.a>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 text-center"
        >
          <a
            href="/"
            className="text-sm text-ink-500 transition hover:text-ember-400"
          >
            {isAr ? "← العودة لعلي الكناني" : "← Back to Ali Alkinani"}
          </a>
        </motion.p>
      </section>
    </main>
  );
}
