// Right-side vertical progress indicator showing the user where they are
// in the page narrative. Each dot represents a chapter — fills in as you
// scroll past it (Zeigarnik effect: empty dots subtly pull the eye to
// complete them).
//
// Click a dot to jump to that chapter. Hidden on mobile to save space —
// MobileBottomBar already handles primary navigation there.

import { useEffect, useState } from "react";
import type { Lang } from "../lib/i18n";

type Chapter = { id: string; ar: string; en: string };

const CHAPTERS: Chapter[] = [
  { id: "origin",  ar: "الأصل",       en: "Origin" },
  { id: "work",    ar: "الأعمال",     en: "Work" },
  { id: "tools",   ar: "أدوات",        en: "Tools" },
  { id: "lab",     ar: "العب",         en: "Play" },
  { id: "throne",  ar: "العرش",        en: "Throne" },
  { id: "ask",     ar: "اسأل",         en: "Ask" },
  { id: "method",  ar: "الطريقة",      en: "Method" },
  { id: "contact", ar: "تواصل",        en: "Contact" },
];

export default function ChapterDots({ lang }: { lang: Lang }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [passedIdx, setPassedIdx] = useState(-1);

  useEffect(() => {
    function onScroll() {
      // The "active" chapter is the one whose top is just above the
      // viewport's vertical midline. Walk the chapters from bottom up
      // and pick the first one whose top is above mid.
      const mid = window.innerHeight * 0.4;
      let active = 0;
      let passed = -1;
      for (let i = 0; i < CHAPTERS.length; i++) {
        const el = document.getElementById(CHAPTERS[i].id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= mid) {
          active = i;
          passed = i;
        }
      }
      setActiveIdx(active);
      setPassedIdx(passed);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const isAr = lang === "ar";
  // RTL: dots appear on the LEFT in Arabic so they don't crash with the
  // Arabic reading flow (eye starts top-right). Use logical positioning.
  const sideClass = isAr ? "left-3 sm:left-5" : "right-3 sm:right-5";

  return (
    <nav
      aria-label={isAr ? "فصول الصفحة" : "Page chapters"}
      className={`pointer-events-none fixed top-1/2 z-30 hidden -translate-y-1/2 lg:block ${sideClass}`}
    >
      <ul className="pointer-events-auto flex flex-col gap-3">
        {CHAPTERS.map((c, i) => {
          const isPassed = i <= passedIdx;
          const isActive = i === activeIdx;
          const labelText = isAr ? c.ar : c.en;
          return (
            <li key={c.id} className="group relative">
              <a
                href={`#${c.id}`}
                aria-label={labelText}
                aria-current={isActive ? "true" : undefined}
                className="relative flex h-7 items-center"
                data-cursor="hover"
              >
                {/* Dot — empty before passed, filled after, ring + glow when active */}
                <span
                  className={`block h-2 w-2 rounded-full transition-all duration-300
                    ${isActive
                      ? "scale-150 bg-ember-500 shadow-[0_0_12px_rgba(255,140,60,0.7)]"
                      : isPassed
                      ? "bg-ember-500/70"
                      : "border border-ink-600 bg-transparent"
                    }`}
                />
                {/* Floating label — appears on hover */}
                <span
                  dir={isAr ? "rtl" : "ltr"}
                  className={`absolute top-1/2 whitespace-nowrap rounded-full border border-ink-800 bg-ink-950/90 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-ink-200 opacity-0 backdrop-blur-md transition-all duration-200 -translate-y-1/2 group-hover:opacity-100
                    ${isAr
                      ? "right-5 group-hover:translate-x-0 translate-x-2"
                      : "left-5 group-hover:translate-x-0 -translate-x-2"
                    }
                    ${isActive ? "text-ember-400" : ""}`}
                >
                  {labelText}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
