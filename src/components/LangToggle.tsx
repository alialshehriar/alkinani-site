import type { Lang } from "../lib/i18n";

export default function LangToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (next: Lang) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-ink-700/60 bg-ink-900/40 p-1 backdrop-blur-md">
      <button
        type="button"
        onClick={() => onChange("ar")}
        className={`rounded-full px-3 py-1 text-xs tracking-wide transition ${
          lang === "ar"
            ? "bg-ink-100 text-ink-950"
            : "text-ink-400 hover:text-ink-100"
        }`}
        aria-pressed={lang === "ar"}
      >
        العربية
      </button>
      <button
        type="button"
        onClick={() => onChange("en")}
        className={`rounded-full px-3 py-1 text-xs tracking-wide transition ${
          lang === "en"
            ? "bg-ink-100 text-ink-950"
            : "text-ink-400 hover:text-ink-100"
        }`}
        aria-pressed={lang === "en"}
      >
        English
      </button>
    </div>
  );
}
