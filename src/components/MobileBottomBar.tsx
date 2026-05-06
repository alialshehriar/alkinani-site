import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";
import type { Lang } from "../lib/i18n";
import { WhatsApp, Compass } from "./Icons";

/**
 * Floating bottom action bar — only on mobile (sm:hidden).
 * Three thumb-reach actions: Play, Throne (champions), WhatsApp.
 * Hides on hero (top), reveals on scroll past hero.
 * Respects iOS safe-area via pb-safe inline style.
 */
export default function MobileBottomBar({ lang }: { lang: Lang }) {
  const { scrollY } = useScroll();
  const [show, setShow] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    setShow(y > 600);
  });

  return (
    <motion.div
      aria-hidden={!show}
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: show ? 0 : 100, opacity: show ? 1 : 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-3 z-40 flex items-center gap-2 rounded-2xl border border-ink-700/60 bg-ink-950/85 p-2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:hidden"
      style={{
        bottom: "max(0.75rem, env(safe-area-inset-bottom))",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      <a
        href="#lab"
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ember-500/30 bg-ember-500/10 px-3 py-3 text-[11px] uppercase tracking-[0.16em] text-ember-400 transition active:scale-[0.97]"
        style={{ minHeight: 48 }}
      >
        <Compass size={16} />
        <span>{lang === "ar" ? "العب" : "Play"}</span>
      </a>
      <a
        href="#throne"
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-tide-500/30 bg-tide-500/10 px-3 py-3 text-[11px] uppercase tracking-[0.16em] text-tide-300 transition active:scale-[0.97]"
        style={{ minHeight: 48 }}
      >
        <span aria-hidden className="text-base">👑</span>
        <span>{lang === "ar" ? "الملك" : "King"}</span>
      </a>
      <a
        href="https://wa.me/966599988522"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp"
        className="flex items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-emerald-400 transition active:scale-[0.95]"
        style={{ minHeight: 48, minWidth: 48 }}
      >
        <WhatsApp size={18} />
      </a>
    </motion.div>
  );
}
