import { motion, useScroll, useTransform } from "motion/react";
import { copy, t, type Lang } from "../lib/i18n";
import { ArrowDown } from "./Icons";
import Ripples from "./Ripples";

export default function Hero({ lang }: { lang: Lang }) {
  const { scrollY } = useScroll();
  const contentY = useTransform(scrollY, [0, 600], [0, 60]);
  const contentOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const imageY = useTransform(scrollY, [0, 800], [0, 80]);
  const imageScale = useTransform(scrollY, [0, 800], [1, 1.08]);

  const isAr = lang === "ar";

  return (
    <section
      id="top"
      className="relative isolate flex min-h-screen w-full items-end overflow-hidden bg-ink-950 sm:items-center"
    >
      {/* Full-bleed photographic hero */}
      <div id="ripple-host" className="absolute inset-0 cursor-pointer">
        <motion.div
          style={{ y: imageY, scale: imageScale }}
          className="absolute inset-0"
        >
          <picture>
            <source media="(max-width: 768px)" srcSet="/images/silhouette-sm.webp" type="image/webp" />
            <source srcSet="/images/silhouette.webp" type="image/webp" />
            <img
              src="/images/silhouette.webp"
              alt=""
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover"
              style={{
                objectPosition: isAr ? "20% center" : "80% center",
                backgroundImage: "url(/images/silhouette-tiny.webp)",
                backgroundSize: "cover",
                backgroundPosition: isAr ? "20% center" : "80% center",
              }}
            />
          </picture>
        </motion.div>

        {/* Side-fade gradient — text in dark side */}
        <div
          className="absolute inset-0"
          style={{
            background: isAr
              ? "linear-gradient(to right, oklch(0.13 0.03 250 / 0.0) 0%, oklch(0.13 0.03 250 / 0.0) 25%, oklch(0.13 0.03 250 / 0.78) 65%, oklch(0.13 0.03 250 / 0.95) 100%)"
              : "linear-gradient(to left, oklch(0.13 0.03 250 / 0.0) 0%, oklch(0.13 0.03 250 / 0.0) 25%, oklch(0.13 0.03 250 / 0.78) 65%, oklch(0.13 0.03 250 / 0.95) 100%)",
          }}
        />
        {/* Mobile bottom fade */}
        <div
          className="absolute inset-0 sm:hidden"
          style={{
            background:
              "linear-gradient(to top, oklch(0.13 0.03 250 / 0.95) 0%, oklch(0.13 0.03 250 / 0.7) 35%, transparent 70%)",
          }}
        />

        {/* Subtle film grain */}
        <div
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.08 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          }}
        />

        {/* Click ripples */}
        <Ripples color="rgba(255,235,200,0.4)" />
      </div>

      {/* Content */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-12 pt-28 sm:px-10 sm:pb-0 sm:pt-0"
      >
        <div className="max-w-2xl">
          <p className="mb-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-ink-400 sm:mb-8 sm:text-xs hero-shown" style={{ animationDelay: "0.15s" }}>
            <span className="h-px w-7 bg-ember-500/70" />
            <span className="line-clamp-1">{t(copy.hero.eyebrow, lang)}</span>
          </p>

          <h1
            className="font-bold text-ink-100 hero-shown"
            style={{
              fontSize: "clamp(3.2rem, 14vw, 9rem)",
              // Arabic glyphs have dots above + diacritics. Tight leading (0.9)
              // crashes them into each other on multi-line wraps. Looser leading
              // for Arabic, tighter for English.
              lineHeight: lang === "ar" ? 1.18 : 0.9,
              letterSpacing: lang === "ar" ? "0" : "-0.02em",
              animationDelay: "0.3s",
            }}
          >
            {t(copy.hero.name, lang)}
          </h1>

          <p
            className="mt-3 font-en text-ink-400 hero-shown"
            style={{ fontSize: "clamp(0.85rem, 1.3vw, 1rem)", letterSpacing: "0.08em", animationDelay: "0.55s" }}
          >
            {t(copy.hero.transliteration, lang)}
          </p>

          <p
            className="mt-7 max-w-2xl text-ink-100 hero-shown sm:mt-10"
            style={{ fontSize: "clamp(1.05rem, 2vw, 1.65rem)", lineHeight: 1.45, animationDelay: "0.7s" }}
          >
            {t(copy.hero.tagline, lang)}
          </p>

          <p
            className="mt-3 max-w-xl text-ink-400 hero-shown"
            style={{ fontSize: "clamp(0.92rem, 1.3vw, 1.05rem)", lineHeight: 1.6, animationDelay: "0.85s" }}
          >
            {t(copy.hero.sub, lang)}
          </p>

          <div
            className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 text-[10px] uppercase tracking-[0.22em] text-ink-400 hero-shown sm:mt-12 sm:gap-x-6 sm:text-[11px]"
            style={{ animationDelay: "1.05s" }}
          >
            <span className="flex items-center gap-2">
              <span className="relative grid h-2 w-2 place-items-center">
                <span className="absolute inset-0 rounded-full bg-emerald-400/70 motion-safe:animate-ping" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>{lang === "ar" ? "ثلاثة أنظمة شغّالة" : "3 systems running"}</span>
            </span>
            <a
              href="#work"
              data-cursor="hover"
              className="group inline-flex items-center gap-2 rounded-full border border-ink-700/70 bg-ink-950/40 px-3.5 py-2 text-[10px] tracking-[0.22em] text-ink-200 backdrop-blur-md transition hover:border-ember-500/60 hover:text-ember-500 sm:text-[11px]"
            >
              {lang === "ar" ? "اعرف الأعمال" : "See the work"}
              <span className="transition group-hover:translate-x-1">{lang === "ar" ? "←" : "→"}</span>
            </a>
          </div>

          {/* Quick-jump shortcuts — gives returning visitors direct access to
              the interactive sections without scrolling through the story arc. */}
          <div
            className="mt-6 grid grid-cols-2 gap-2 hero-shown sm:mt-8 sm:flex sm:flex-wrap sm:gap-2.5"
            style={{ animationDelay: "1.2s" }}
          >
            {[
              { href: "/tools/turjuman", emoji: "🎬", labelAr: "ترجمان",     labelEn: "Turjuman", subAr: "ترجمة فيديو AI", subEn: "AI video subs", featured: true },
              { href: "#radar",    emoji: "📡", labelAr: "الرادار",    labelEn: "Radar",    subAr: "إشارات AI",      subEn: "AI signals", featured: false },
              { href: "#lab",      emoji: "🎮", labelAr: "العب",        labelEn: "Play",     subAr: "٣ ألعاب",        subEn: "3 games", featured: false },
              { href: "#throne",   emoji: "👑", labelAr: "العرش",       labelEn: "Throne",   subAr: "أبطال الموقع",   subEn: "leaderboard", featured: false },
              { href: "#ask",      emoji: "💬", labelAr: "اسأل علي",   labelEn: "Ask Ali",   subAr: "محادثة AI",     subEn: "AI chat", featured: false },
            ].map((s) => (
              <a
                key={s.href}
                href={s.href}
                data-cursor="hover"
                className={
                  s.featured
                    ? "group flex items-center gap-2.5 rounded-2xl border border-ember-500/40 bg-gradient-to-br from-ember-500/15 to-ember-400/5 px-3 py-2.5 text-start backdrop-blur-md transition hover:-translate-y-0.5 hover:border-ember-400/80 hover:bg-ember-500/20 sm:px-3.5 sm:py-2"
                    : "group flex items-center gap-2.5 rounded-2xl border border-ink-800/70 bg-ink-900/30 px-3 py-2.5 text-start backdrop-blur-md transition hover:-translate-y-0.5 hover:border-ember-500/60 hover:bg-ink-900/60 sm:px-3.5 sm:py-2"
                }
              >
                <span className="text-base sm:text-lg" aria-hidden>{s.emoji}</span>
                <span className="flex flex-col leading-tight">
                  <span className={
                    s.featured
                      ? "flex items-center gap-1.5 text-[11px] font-medium text-ember-300 group-hover:text-ember-200 sm:text-xs"
                      : "text-[11px] font-medium text-ink-100 group-hover:text-ember-400 sm:text-xs"
                  }>
                    {lang === "ar" ? s.labelAr : s.labelEn}
                    {s.featured && (
                      <span className="rounded-full bg-ember-500/20 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.18em] text-ember-300 sm:text-[9px]">
                        {lang === "ar" ? "جديد" : "new"}
                      </span>
                    )}
                  </span>
                  <span className={
                    s.featured
                      ? "text-[9px] uppercase tracking-[0.18em] text-ember-400/70 sm:text-[10px]"
                      : "text-[9px] uppercase tracking-[0.18em] text-ink-500 sm:text-[10px]"
                  }>
                    {lang === "ar" ? s.subAr : s.subEn}
                  </span>
                </span>
              </a>
            ))}
          </div>

          <p
            className="mt-5 text-[10px] uppercase tracking-[0.3em] text-ink-600 hero-shown sm:mt-6"
            style={{ animationDelay: "1.4s" }}
          >
            {lang === "ar" ? "↗ المس البحر" : "↗ tap the sea"}
          </p>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 hidden flex-col items-center gap-2 text-ink-500 sm:flex hero-shown"
        style={{ animationDelay: "1.4s" }}
      >
        <span className="text-[10px] uppercase tracking-[0.3em]">{t(copy.hero.scroll, lang)}</span>
        <span className="motion-safe:animate-bounce">
          <ArrowDown size={16} />
        </span>
      </div>
    </section>
  );
}
