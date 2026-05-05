import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Lang } from "../lib/i18n";

const SEQ = ["a", "l", "k"];

/**
 * Type "alk" anywhere on the page to summon a secret panel —
 * a small "thank you" from Ali with one extra contact route.
 */
export default function EasterEgg({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [hintShown, setHintShown] = useState(false);

  useEffect(() => {
    let i = 0;
    let t: number | null = null;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const k = e.key.toLowerCase();
      if (k === SEQ[i]) {
        i++;
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => { i = 0; }, 1500);
        if (i === SEQ.length) {
          setOpen(true);
          setHintShown(true);
          i = 0;
        }
      } else {
        i = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    // Subtle hint after 25s if not yet found
    const hintT = window.setTimeout(() => setHintShown(true), 25000);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(hintT);
      if (t) window.clearTimeout(t);
    };
  }, []);

  const isAr = lang === "ar";

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="bd"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[90] bg-ink-950/70 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="card"
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-4 top-1/2 z-[91] mx-auto -translate-y-1/2 max-w-md rounded-2xl border border-ember-500/40 bg-ink-900/95 p-7 shadow-[0_30px_120px_-20px_oklch(0.72_0.17_50_/_0.4)] backdrop-blur-xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-ember-500">
                <span className="h-1 w-1 rounded-full bg-ember-500" />
                {isAr ? "اكتشفت سر" : "Secret unlocked"}
              </div>
              <h3
                className="mt-4 font-semibold leading-tight text-ink-100"
                style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}
              >
                {isAr ? "لقيتها." : "You found it."}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-300 sm:text-base">
                {isAr
                  ? "إذا توصل لهنا، يعني فاضي لك صبر. هذا قناة مباشرة بعيد عن النموذج: تيليجرام علي، يفتحها بنفسه."
                  : "If you got here, you have rare patience. This is a direct line — past the AI, straight to Ali."}
              </p>
              <a
                href="https://t.me/o0a98"
                target="_blank"
                rel="noopener noreferrer"
                data-cursor="hover"
                className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-ember-500/40 bg-ember-500/10 px-5 py-3.5 text-sm text-ember-400 transition hover:bg-ember-500/20"
              >
                <span className="font-en uppercase tracking-[0.2em]">Telegram · @o0a98</span>
                <span className="font-en">↗</span>
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-4 w-full text-center text-[11px] uppercase tracking-[0.22em] text-ink-500 transition hover:text-ink-200"
              >
                {isAr ? "اقفل" : "Close"} · Esc
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Subtle hint */}
      <AnimatePresence>
        {hintShown && !open && (
          <motion.div
            key="hint"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="fixed bottom-4 z-40 hidden items-center gap-2 rounded-full border border-ink-800 bg-ink-950/80 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-ink-500 backdrop-blur-md sm:bottom-5 sm:flex"
            style={{ [isAr ? "left" : "right"]: "1.25rem" } as React.CSSProperties}
          >
            <span className="h-1 w-1 rounded-full bg-ember-500/70" />
            <span className="font-en">type "alk"</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Esc to close */}
      <KeyHandler open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function KeyHandler({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return null;
}
