import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import type { Lang } from "../lib/i18n";
import ReflexLab from "./ReflexLab";
import TechSprint from "./TechSprint";
import Pulse from "./Pulse";

type Tab = "reflex" | "sprint" | "pulse";

const COPY = {
  ar: {
    eyebrow: "/02 العب",
    title: "ثلاث ألعاب. كل وحدة تشتغل في الدماغ من زاوية مختلفة.",
    sub: "Reflex Lab يكشف نمطك كمؤسس. Tech Sprint يختبر سرعة معرفتك. Pulse يدرّب ذاكرتك العاملة. الثلاث مجاني، بدون تسجيل، يشتغلون على الجوال.",
    tabs: {
      reflex: { name: "Reflex Lab", desc: "نمطك كمؤسس · ٤٢ ث", emoji: "🎴" },
      sprint: { name: "Tech Sprint", desc: "سباق نقاط · ٦٠ ث", emoji: "⚡" },
      pulse:  { name: "Pulse",       desc: "ذاكرة عاملة · مفتوح", emoji: "🧠" },
    },
  },
  en: {
    eyebrow: "/02 play",
    title: "three games. each one trains the brain from a different angle.",
    sub: "Reflex Lab maps your founder DNA. Tech Sprint tests recall speed. Pulse trains visual working memory. all three free, no signup, mobile-first.",
    tabs: {
      reflex: { name: "Reflex Lab", desc: "founder DNA · 42s",   emoji: "🎴" },
      sprint: { name: "Tech Sprint", desc: "score race · 60s",   emoji: "⚡" },
      pulse:  { name: "Pulse",       desc: "working memory",      emoji: "🧠" },
    },
  },
} as const;

export default function PlayLab({ lang }: { lang: Lang }) {
  const [tab, setTab] = useState<Tab>("reflex");
  const isAr = lang === "ar";
  const L = COPY[lang];

  return (
    <section id="lab" className="relative w-full overflow-hidden px-5 py-24 sm:px-8 sm:py-40">
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

      <div className="relative mx-auto max-w-5xl">
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
          aria-label={isAr ? "ألعاب" : "games"}
          className="mt-8 grid grid-cols-1 gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-1.5 backdrop-blur-md sm:grid-cols-3"
        >
          {(["reflex", "sprint", "pulse"] as Tab[]).map((id) => (
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
                  layoutId="active-tab"
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-ember-500/30 via-ember-500/0 to-tide-500/20 ring-1 ring-ember-500/40"
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`font-en text-[11px] uppercase tracking-[0.22em] ${tab === id ? "text-ember-500" : "text-ink-300"}`}>
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
            {tab === "reflex" && (
              <motion.div
                key="reflex"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                <ReflexLab lang={lang} />
              </motion.div>
            )}
            {tab === "sprint" && (
              <motion.div
                key="sprint"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                <TechSprint lang={lang} />
              </motion.div>
            )}
            {tab === "pulse" && (
              <motion.div
                key="pulse"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                <Pulse lang={lang} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
