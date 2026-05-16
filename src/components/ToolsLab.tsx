import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import type { Lang } from "../lib/i18n";
import Radar from "./Radar";

type Tab = "turjuman" | "radar";

const COPY = {
  ar: {
    eyebrow: "/ أدوات شغّالة",
    title: "أدوات بنيتها لنفسي — مفتوحة لك.",
    sub: "ترجمان يحرق الترجمة العربية على أي فيديو خلال دقائق. الرادار يلتقط أخبار وأدوات الذكاء الاصطناعي قبل ما تنتشر، مفسّرة بالعربي.",
    tabs: {
      turjuman: { name: "ترجمان", desc: "ترجمة فيديو · ٥ دقايق مجاناً", emoji: "🎬" },
      radar:    { name: "رادار",   desc: "إشارات AI · مباشر",            emoji: "📡" },
    },
    turjuman: {
      eyebrow: "/ ترجمان",
      heading: "الصق رابط الفيديو، استلمه مترجماً.",
      body: "الصق رابط من تيك توك أو إكس أو يوتيوب، أو ارفع ملف. ترجمان يستخرج الكلام، يترجمه يفهم السياق، ويحرق الترجمة العربية على الفيديو نفسه. ٥ دقايق مجاناً، بدون بطاقة.",
      bullets: [
        "يفهم اللهجة والسياق — مو ترجمة حرفية",
        "يحترم تنسيق Netflix (٤٢ حرف لكل سطر)",
        "يشتغل على فيديوهات أفقية وعمودية",
      ],
      cta: "افتح ترجمان",
    },
    radar: {
      eyebrow: "/ رادار AI",
      heading: "إشارات AI قبل ما تنتشر.",
    },
  },
  en: {
    eyebrow: "/ working tools",
    title: "tools i built for myself — open to you.",
    sub: "Turjuman burns Arabic subtitles into any video in minutes. Radar catches AI news and tools before they trend, explained in Arabic.",
    tabs: {
      turjuman: { name: "Turjuman", desc: "video subs · 5 free minutes", emoji: "🎬" },
      radar:    { name: "Radar",     desc: "AI signals · live",          emoji: "📡" },
    },
    turjuman: {
      eyebrow: "/ Turjuman",
      heading: "Paste a video link. Get it translated.",
      body: "Drop a TikTok / X / YouTube link, or upload a file. Turjuman extracts the speech, translates it with context, and burns Arabic subtitles into the video itself. 5 minutes free, no card needed.",
      bullets: [
        "Context-aware — not literal translation",
        "Netflix-grade (42 chars per line)",
        "Works on landscape and portrait clips",
      ],
      cta: "Open Turjuman",
    },
    radar: {
      eyebrow: "/ AI Radar",
      heading: "AI signals before they trend.",
    },
  },
} as const;

export default function ToolsLab({ lang }: { lang: Lang }) {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "turjuman";
    return window.location.hash === "#radar" ? "radar" : "turjuman";
  });
  const isAr = lang === "ar";
  const L = COPY[lang];

  // Switch tabs when the user clicks an in-page #radar / #turjuman anchor
  // (Hero shortcut, chapter dots, mobile bottom bar) so the hash deep-link
  // still surfaces the right tool. The anchor itself targets the #tools
  // section, so the browser scrolls there; we just sync the tab state.
  useEffect(() => {
    function onHash() {
      const h = window.location.hash;
      if (h === "#radar") {
        setTab("radar");
        document.getElementById("tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (h === "#turjuman" || h === "#tools") {
        setTab("turjuman");
        document.getElementById("tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    // Run once for the deep-link case (#radar in the URL on initial load):
    // the browser scrolls to #radar before React mounts ToolsLab, fails to
    // find it, and gives up. We re-scroll to #tools after the tab is set.
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <section id="tools" className="relative w-full overflow-hidden px-5 py-24 sm:px-8 sm:py-36">
      <div
        className="ambient-orb pulse-soft"
        style={{
          width: 540,
          height: 540,
          top: "5%",
          [isAr ? "right" : "left"]: -180,
          background: "oklch(0.72 0.17 50 / 1)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-6 sm:gap-10 lg:grid-cols-12">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            {L.eyebrow}
          </motion.p>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-semibold leading-[1.05] text-ink-100 lg:col-span-8"
            style={{ fontSize: "clamp(1.95rem, 5vw, 3.6rem)" }}
          >
            {L.title}
          </motion.h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink-400 sm:text-base" style={{ lineHeight: 1.65 }}>
          {L.sub}
        </p>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={isAr ? "أدوات" : "tools"}
          className="mt-8 grid grid-cols-1 gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-1.5 backdrop-blur-md sm:grid-cols-2"
        >
          {(["turjuman", "radar"] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-cursor="hover"
              onClick={() => setTab(id)}
              className={`relative rounded-xl px-4 py-3 text-start transition ${
                tab === id ? "bg-ink-950" : "hover:bg-ink-950/40"
              }`}
            >
              {tab === id && (
                <motion.span
                  layoutId="active-tools-tab"
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-ember-500/30 via-ember-500/0 to-tide-500/20 ring-1 ring-ember-500/40"
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${tab === id ? "text-ember-400" : "text-ink-200"}`}>
                    {L.tabs[id].name}
                  </div>
                  <div className="mt-1 truncate text-[12px] text-ink-500">{L.tabs[id].desc}</div>
                </div>
                <span className={`text-2xl ${tab === id ? "" : "opacity-50"}`}>
                  {L.tabs[id].emoji}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Active panel */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            {tab === "turjuman" && (
              <motion.div
                key="turjuman"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                <TurjumanCard lang={lang} L={L} />
              </motion.div>
            )}
            {tab === "radar" && (
              <motion.div
                key="radar"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                <Radar lang={lang} embedded />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

type Copy = (typeof COPY)[Lang];

function TurjumanCard({ lang, L }: { lang: Lang; L: Copy }) {
  const isAr = lang === "ar";
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
      {/* Left — copy */}
      <div className="lg:col-span-7">
        <p className="text-[11px] uppercase tracking-[0.3em] text-ember-500/80">
          {L.turjuman.eyebrow}
        </p>
        <h3
          className="mt-3 font-semibold leading-[1.1] text-ink-100"
          style={{ fontSize: "clamp(1.6rem, 3.6vw, 2.6rem)" }}
        >
          {L.turjuman.heading}
        </h3>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-300 sm:text-base">
          {L.turjuman.body}
        </p>

        <ul className="mt-6 space-y-2.5">
          {L.turjuman.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-ink-200">
              <span
                aria-hidden
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember-500"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a
            href="/tools/turjuman"
            data-cursor="hover"
            className="group inline-flex items-center gap-2 rounded-full border border-ember-500/60 bg-gradient-to-br from-ember-500/20 to-ember-400/5 px-5 py-3 text-sm font-medium text-ember-200 backdrop-blur transition hover:-translate-y-0.5 hover:border-ember-400 hover:from-ember-500/30 hover:text-ember-100"
          >
            {L.turjuman.cta}
            <span className="transition group-hover:translate-x-1">{isAr ? "←" : "→"}</span>
          </a>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-300">
            {isAr ? "مباشر" : "live"}
          </span>
        </div>
      </div>

      {/* Right — visual mock of the tool */}
      <div className="lg:col-span-5">
        <div className="relative overflow-hidden rounded-3xl border border-ink-800/70 bg-gradient-to-br from-ink-900/80 to-ink-950/60 p-6 backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <span className="ms-3 font-en text-[10px] uppercase tracking-[0.2em] text-ink-500">
              alkinani.live/tools/turjuman
            </span>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-600">
                {isAr ? "رابط الفيديو" : "video URL"}
              </div>
              <div className="mt-1 truncate font-en text-xs text-ink-300">
                tiktok.com/@user/video/...
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-600">
                  {isAr ? "من" : "from"}
                </div>
                <div className="mt-0.5 font-en text-xs text-ink-200">English</div>
              </div>
              <div className="rounded-xl border border-ember-500/40 bg-ember-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ember-500/80">
                  {isAr ? "إلى" : "to"}
                </div>
                <div className="mt-0.5 text-xs text-ember-200">{isAr ? "العربية" : "Arabic"}</div>
              </div>
            </div>

            <div className="relative aspect-video overflow-hidden rounded-xl border border-ink-800 bg-gradient-to-br from-ink-800/60 to-ink-950">
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 30% 20%, oklch(0.72 0.17 50 / 0.5), transparent 60%), radial-gradient(circle at 70% 80%, oklch(0.65 0.12 240 / 0.4), transparent 60%)",
                }}
              />
              <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/85 px-3 py-1.5 text-center text-xs text-white shadow-lg" dir="rtl">
                {isAr ? "الترجمة محروقة على الفيديو نفسه" : "الترجمة محروقة على الفيديو نفسه"}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
                {isAr ? "حالة" : "status"}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-300">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                {isAr ? "جاهز" : "ready"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
