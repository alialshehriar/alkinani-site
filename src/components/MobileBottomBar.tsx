import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";
import type { Lang } from "../lib/i18n";
import { WhatsApp, Compass } from "./Icons";

/**
 * Floating bottom action bar — only on mobile (sm:hidden).
 * Two primary actions always within thumb reach: WhatsApp + Ask Ali.
 * Hides on hero (top), reveals on scroll past hero.
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
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: show ? 0 : 90, opacity: show ? 1 : 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-2 rounded-2xl border border-ink-700/60 bg-ink-950/85 p-2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:hidden"
      style={{ pointerEvents: show ? "auto" : "none" }}
    >
      <a
        href="#ask"
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ember-500/30 bg-ember-500/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-ember-400 transition active:scale-[0.97]"
      >
        <Compass size={16} />
        <span>{lang === "ar" ? "اسأل علي" : "Ask Ali"}</span>
      </a>
      <a
        href="https://wa.me/966599988522"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp"
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-emerald-400 transition active:scale-[0.95]"
      >
        <WhatsApp size={18} />
      </a>
    </motion.div>
  );
}
