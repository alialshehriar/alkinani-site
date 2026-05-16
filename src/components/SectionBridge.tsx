// Small narrative connector between sections — sits at the BOTTOM of one
// section and points the eye at the next. Clickable to scroll-anchor.
//
// Visual: a subtle horizontal divider with a centered pill that says
// "↓ <text>" — animates a slow vertical bounce on the arrow to draw
// the eye downward without being noisy.

import { motion } from "motion/react";
import type { Lang } from "../lib/i18n";

const ease = [0.22, 1, 0.36, 1] as const;

export default function SectionBridge({
  to,
  lang,
  ar,
  en,
}: {
  to: string;
  lang: Lang;
  ar: string;
  en: string;
}) {
  const isAr = lang === "ar";
  const text = isAr ? ar : en;
  return (
    <div className="relative w-full px-6 pb-16 pt-2 sm:pb-20" aria-hidden="false">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col items-center gap-3">
          {/* Vertical line that drips into the pill */}
          <motion.div
            initial={false}
            whileInView={{ scaleY: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.8, ease }}
            className="h-12 w-px origin-top bg-gradient-to-b from-transparent via-ember-500/30 to-ember-500/60"
            style={{ scaleY: 0, opacity: 0 }}
          />
          <motion.a
            href={to}
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.6, ease, delay: 0.2 }}
            whileHover={{ y: -2 }}
            className="group inline-flex items-center gap-2.5 rounded-full border border-ink-800/70 bg-ink-900/40 px-5 py-2.5 text-xs text-ink-300 backdrop-blur-md transition hover:border-ember-500/50 hover:bg-ink-900/70 hover:text-ember-400 sm:text-sm"
            data-cursor="hover"
          >
            <span dir={isAr ? "rtl" : "ltr"} className="font-medium">
              {text}
            </span>
            <span
              className="text-base transition motion-safe:animate-bounce-slow group-hover:translate-y-0.5"
              aria-hidden
            >
              ↓
            </span>
          </motion.a>
        </div>
      </div>
    </div>
  );
}
