import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { copy, t, type Lang } from "../lib/i18n";
import LangToggle from "./LangToggle";
import Mark from "./Mark";

export default function Nav({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  const [open, setOpen] = useState(false);
  const isAr = lang === "ar";
  const items = [
    { id: "work", label: copy.nav.work, icon: "▦", href: "#work" },
    { id: "lab", label: copy.nav.lab, icon: "🎮", href: "#lab" },
    { id: "tools", label: copy.nav.tools, icon: "▣", href: "/tools" },
    { id: "ask", label: copy.nav.ask, icon: "✷", href: "#ask" },
    { id: "contact", label: copy.nav.contact, icon: "↗", href: "#contact" },
  ];

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:pt-6"
      >
        <div className="flex w-full max-w-6xl items-center justify-between gap-2 rounded-full border border-ink-700/40 bg-ink-950/60 px-3 py-2.5 backdrop-blur-xl sm:px-4">
          <a href="#top" data-cursor="hover" className="flex items-center gap-2 text-ink-100">
            <Mark size={26} />
            <span className="hidden text-sm font-medium tracking-tight sm:inline">
              {lang === "ar" ? "علي الكناني" : "Ali Alkinani"}
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-7 md:flex">
            {items.map((it) => (
              <a
                key={it.id}
                href={it.href}
                data-cursor="hover"
                className="text-sm text-ink-300 transition hover:text-ink-100"
              >
                {t(it.label, lang)}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <LangToggle lang={lang} onChange={setLang} />

            {/* Mobile burger */}
            <button
              type="button"
              aria-label={isAr ? "القائمة" : "Menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full border border-ink-700/60 bg-ink-900/40 text-ink-200 transition hover:border-ember-500/60 hover:text-ember-500 md:hidden"
            >
              <Burger open={open} />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="mobile-nav-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-40 bg-ink-950/85 backdrop-blur-md md:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="mobile-nav-panel"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-3 top-20 z-50 overflow-hidden rounded-3xl border border-ink-700/60 bg-ink-900/95 shadow-2xl backdrop-blur-xl md:hidden"
              dir={isAr ? "rtl" : "ltr"}
            >
              <nav className="divide-y divide-ink-800">
                {items.map((it, i) => (
                  <motion.a
                    key={it.id}
                    initial={{ opacity: 0, x: isAr ? 8 : -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 0.05 + i * 0.04 }}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="group flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-ink-800/50 active:bg-ember-500/10"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg border border-ink-700/70 bg-ink-950/60 text-ember-400 transition group-hover:border-ember-500/50">
                        <span className="text-base">{it.icon}</span>
                      </span>
                      <span className="text-base font-medium text-ink-100">
                        {t(it.label, lang)}
                      </span>
                    </span>
                    <span className="text-ink-500 transition group-hover:text-ember-500">
                      {isAr ? "←" : "→"}
                    </span>
                  </motion.a>
                ))}
              </nav>

              <div className="grid grid-cols-2 gap-2 border-t border-ink-800 bg-ink-950/40 p-4">
                <a
                  href="https://wa.me/966599988522"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-[11px] uppercase tracking-[0.18em] text-emerald-400"
                >
                  WhatsApp
                </a>
                <a
                  href="https://x.com/o0a98"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-ink-700/70 bg-ink-900/60 px-3 py-2.5 text-[11px] uppercase tracking-[0.18em] text-ink-300"
                >
                  X · @o0a98
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Burger({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <motion.line
        x1="2" y1="4" x2="14" y2="4"
        animate={open ? { x1: 3, y1: 3, x2: 13, y2: 13 } : { x1: 2, y1: 4, x2: 14, y2: 4 }}
        transition={{ duration: 0.25 }}
      />
      <motion.line
        x1="2" y1="8" x2="14" y2="8"
        animate={open ? { opacity: 0 } : { opacity: 1 }}
        transition={{ duration: 0.15 }}
      />
      <motion.line
        x1="2" y1="12" x2="14" y2="12"
        animate={open ? { x1: 3, y1: 13, x2: 13, y2: 3 } : { x1: 2, y1: 12, x2: 14, y2: 12 }}
        transition={{ duration: 0.25 }}
      />
    </svg>
  );
}
