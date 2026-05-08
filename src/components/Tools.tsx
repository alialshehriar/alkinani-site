import ToolCard from "./ToolCard";
import type { Lang } from "../lib/i18n";

type Props = { lang: Lang };

export default function Tools({ lang }: Props) {
  const isAr = lang === "ar";
  return (
    <main className="min-h-screen bg-ink-950 text-ink-100">
      <section className="mx-auto max-w-3xl px-6 sm:px-12 pt-32 pb-20">
        <header className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.22em] text-ember-400 mb-3">
            {isAr ? "أدوات" : "Tools"}
          </p>
          <h1 className="text-5xl font-medium tracking-tight">
            {isAr ? "أدوات علي" : "Tools by Ali"}
          </h1>
          <p className="mt-4 text-ink-400">
            {isAr
              ? "أدوات صنعتها لأشغل بها يومي. مفتوحة للجميع."
              : "Tools I built to run my day. Open for everyone."}
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <ToolCard
            arabicTitle="ترجمان"
            englishTitle="Turjuman"
            description={
              isAr
                ? "ترجمة فيديو احترافية تحترم السياق."
                : "Professional, context-aware video translation."
            }
            href="/tools/turjuman"
            badge={isAr ? "جديد" : "New"}
          />
          <ToolCard
            arabicTitle="رادار"
            englishTitle="Radar"
            description={
              isAr
                ? "آخر الأخبار التقنية مفسّرة بالعربي."
                : "Latest AI signals, translated to Arabic."
            }
            href="/#radar"
          />
        </div>

        <p className="mt-12 text-center text-sm text-ink-500">
          <a href="/" className="hover:text-ember-400 transition">
            {isAr ? "← العودة للرئيسية" : "← Back to home"}
          </a>
        </p>
      </section>
    </main>
  );
}
