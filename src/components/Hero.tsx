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
          <img
            src="/images/silhouette.png"
            alt=""
            className="h-full w-full object-cover"
            style={{
              objectPosition: isAr ? "20% center" : "80% center",
            }}
          />
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
        className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-20 pt-32 sm:px-10 sm:pb-0 sm:pt-0"
      >
        <div className="max-w-2xl">
          <p className="mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-ink-400 sm:mb-8 hero-shown" style={{ animationDelay: "0.15s" }}>
            <span className="h-px w-8 bg-ember-500/70" />
            {t(copy.hero.eyebrow, lang)}
          </p>

          <h1
            className="font-bold leading-[0.92] text-ink-100 hero-shown"
            style={{ fontSize: "clamp(3rem, 9.5vw, 9rem)", animationDelay: "0.3s" }}
          >
            {t(copy.hero.name, lang)}
          </h1>

          <p
            className="mt-4 font-en text-ink-400 hero-shown"
            style={{ fontSize: "clamp(0.85rem, 1.3vw, 1rem)", letterSpacing: "0.08em", animationDelay: "0.55s" }}
          >
            {t(copy.hero.transliteration, lang)}
          </p>

          <p
            className="mt-10 max-w-2xl text-ink-100 hero-shown"
            style={{ fontSize: "clamp(1.15rem, 1.9vw, 1.65rem)", lineHeight: 1.45, animationDelay: "0.7s" }}
          >
            {t(copy.hero.tagline, lang)}
          </p>

          <p
            className="mt-3 max-w-xl text-ink-400 hero-shown"
            style={{ fontSize: "clamp(0.95rem, 1.3vw, 1.05rem)", lineHeight: 1.6, animationDelay: "0.85s" }}
          >
            {t(copy.hero.sub, lang)}
          </p>

          <div
            className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] uppercase tracking-[0.22em] text-ink-400 hero-shown"
            style={{ animationDelay: "1.05s" }}
          >
            <span className="flex items-center gap-2">
              <span className="relative grid h-2 w-2 place-items-center">
                <span className="absolute inset-0 rounded-full bg-emerald-400/70 motion-safe:animate-ping" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>{lang === "ar" ? "ثلاثة أنظمة تشتغل الحين" : "Three systems running now"}</span>
            </span>
            <a
              href="#work"
              data-cursor="hover"
              className="group inline-flex items-center gap-2 rounded-full border border-ink-700/70 bg-ink-950/40 px-4 py-2 text-[11px] tracking-[0.22em] text-ink-200 backdrop-blur-md transition hover:border-ember-500/60 hover:text-ember-500"
            >
              {lang === "ar" ? "اعرف الأعمال" : "See the work"}
              <span className="transition group-hover:translate-x-1">{lang === "ar" ? "←" : "→"}</span>
            </a>
          </div>

          <p
            className="mt-6 text-[10px] uppercase tracking-[0.3em] text-ink-600 hero-shown"
            style={{ animationDelay: "1.35s" }}
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
