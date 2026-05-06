import { motion } from "motion/react";
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
  const items = [
    { id: "work", label: copy.nav.work },
    { id: "lab", label: copy.nav.lab },
    { id: "ask", label: copy.nav.ask },
    { id: "contact", label: copy.nav.contact },
  ];

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:pt-6"
    >
      <div className="flex w-full max-w-6xl items-center justify-between rounded-full border border-ink-700/40 bg-ink-950/60 px-4 py-2.5 backdrop-blur-xl">
        <a href="#top" data-cursor="hover" className="flex items-center gap-2 text-ink-100">
          <Mark size={26} />
          <span className="hidden text-sm font-medium tracking-tight sm:inline">
            {lang === "ar" ? "علي الكناني" : "Ali Alkinani"}
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {items.map((it) => (
            <a
              key={it.id}
              href={`#${it.id}`}
              data-cursor="hover"
              className="text-sm text-ink-300 transition hover:text-ink-100"
            >
              {t(it.label, lang)}
            </a>
          ))}
        </nav>

        <LangToggle lang={lang} onChange={setLang} />
      </div>
    </motion.header>
  );
}
