import { copy, t, type Lang } from "../lib/i18n";
import Mark from "./Mark";

export default function Footer({ lang }: { lang: Lang }) {
  return (
    <footer className="w-full px-6 pb-12 pt-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="hairline mb-8 h-px w-full" />
        <div className="flex flex-col gap-3 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Mark size={22} />
            <span>{t(copy.footer.line1, lang)}</span>
          </div>
          <div className="font-en uppercase tracking-[0.25em]">
            {t(copy.footer.line2, lang)}
          </div>
        </div>
      </div>
    </footer>
  );
}
