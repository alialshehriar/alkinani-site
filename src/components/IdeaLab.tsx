import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";
import type { Lang } from "../lib/i18n";

type Score = { value: number; reason: string };
type Result = {
  lang: "ar" | "en";
  scores: { market: Score; unique: Score; execution: Score };
  summary: string;
  recommendation: string;
  references: string[];
};

const LABELS = {
  ar: {
    eyebrow: "/05 لعبة بذرة",
    title: "اختبر فكرتك في 8 ثواني.",
    sub: "نفس المحرك الي يستخدمه أصحاب الأفكار في بذرة. اكتب فكرتك (سطرين)، النظام يحللها — سوق + تميّز + تنفيذ + خطوة الأسبوع الجاي.",
    placeholder: "مثال: تطبيق توصيل قهوة مختصة بالاشتراك الشهري",
    button: "حلّل الفكرة",
    sending: "يحلل…",
    market: "السوق",
    unique: "التميّز",
    execution: "التنفيذ",
    overall: "الترشيح الإجمالي",
    tldr: "الخلاصة",
    rec: "خطوتك الجاية",
    refs: "ادرس مثل هذي",
    again: "فكرة ثانية",
    error: "حصل خطأ. جرب مرة ثانية.",
    starters: [
      "تطبيق توصيل قهوة مختصة بالاشتراك",
      "منصة AI لتعلم العربية للأطفال",
      "أداة تلخيص اجتماعات بالـAI للسعوديين",
    ],
    starterLabel: "أو جرب مثال:",
    teaches: "وش تتعلم؟",
    teachesBody:
      "ثلاث محاور تحدد لو الفكرة تستاهل وقتك: حجم السوق + إيش يميزك عن الموجود + كم التنفيذ صعب. إذا واحد منها أقل من 4، الفكرة تحتاج تعديل.",
  },
  en: {
    eyebrow: "/05 Bithrah lens",
    title: "Test your idea in 8 seconds.",
    sub: "The same engine founders run inside Bithrah. Write your idea, the system scores it on market, uniqueness, and execution — and tells you the one move to make this week.",
    placeholder: "Example: An AI tutor for K-12 Arabic students",
    button: "Analyze",
    sending: "Analyzing…",
    market: "Market",
    unique: "Uniqueness",
    execution: "Execution",
    overall: "Overall verdict",
    tldr: "TL;DR",
    rec: "Your move this week",
    refs: "Study these",
    again: "New idea",
    error: "Something went wrong. Try again.",
    starters: [
      "AI tutor for K-12 Arabic students",
      "Subscription specialty coffee delivery",
      "Meeting-summary AI for Saudi teams",
    ],
    starterLabel: "Or try an example:",
    teaches: "What you learn",
    teachesBody:
      "Three axes decide if an idea is worth your time: market size, your edge over what exists, and execution difficulty. If any score drops below 4, the idea needs to be reframed.",
  },
} as const;

function ScoreBar({
  label,
  score,
  delay = 0,
}: {
  label: string;
  score: Score;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });
  const target = Math.max(0, Math.min(10, score.value));
  const color = target >= 7 ? "ember-500" : target >= 4 ? "tide-500" : "red-400";
  const colorBg =
    target >= 7
      ? "from-ember-500 to-ember-400"
      : target >= 4
      ? "from-tide-500 to-tide-400"
      : "from-red-500 to-red-400";

  return (
    <div ref={ref} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.22em] text-ink-400">{label}</span>
        <span className={`num-display text-${color}`} style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}>
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.5, delay }}
          >
            {target}
          </motion.span>
          <span className="text-ink-600 text-sm">/10</span>
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: target / 10 } : {}}
          transition={{ duration: 0.9, delay: delay + 0.05, ease: [0.22, 1, 0.36, 1] }}
          className={`h-full origin-[0%_50%] bg-gradient-to-r ${colorBg}`}
          style={{ width: "100%" }}
        />
      </div>
      {score.reason && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: delay + 0.15 }}
          className="text-sm leading-relaxed text-ink-300"
          style={{ lineHeight: 1.65 }}
        >
          {score.reason}
        </motion.p>
      )}
    </div>
  );
}

function VerdictDot({ overall }: { overall: number }) {
  const color = overall >= 7 ? "bg-ember-500" : overall >= 4 ? "bg-tide-500" : "bg-red-400";
  return (
    <span className="relative grid h-2.5 w-2.5 place-items-center">
      <span className={`absolute inset-0 rounded-full ${color} opacity-60 motion-safe:animate-ping`} />
      <span className={`relative h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

export default function IdeaLab({ lang }: { lang: Lang }) {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const L = LABELS[lang];
  const isAr = lang === "ar";

  const analyze = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: t }),
      });
      if (!res.ok) {
        setError(L.error);
        return;
      }
      const data = (await res.json()) as Result;
      setResult(data);
    } catch {
      setError(L.error);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setIdea("");
    setError(null);
  };

  const overall = result
    ? Math.round(
        (result.scores.market.value + result.scores.unique.value + result.scores.execution.value) / 3,
      )
    : 0;

  return (
    <section id="lab" className="relative w-full overflow-hidden px-5 py-24 sm:px-8 sm:py-40">
      <div
        className="ambient-orb pulse-soft"
        style={{
          width: 540,
          height: 540,
          top: "5%",
          [isAr ? "right" : "left"]: -180,
          background: "oklch(0.72 0.17 50 / 1)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-6 sm:gap-10 lg:grid-cols-12">
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7 }}
            className="text-xs uppercase tracking-[0.3em] text-ember-500 lg:col-span-4"
          >
            {L.eyebrow}
          </motion.p>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-semibold leading-[1.05] text-ink-100 lg:col-span-8"
            style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}
          >
            {L.title}
          </motion.h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink-400 sm:text-base" style={{ lineHeight: 1.65 }}>
          {L.sub}
        </p>

        {/* Lab card */}
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.9 }}
          className="mt-10 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/50 shadow-2xl backdrop-blur-md"
        >
          {/* chrome */}
          <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
              <span className="h-2.5 w-2.5 rounded-full bg-ember-500/80 shrink-0" />
              <span className="ms-3 truncate font-en text-[10px] uppercase tracking-[0.2em] text-ink-500 sm:text-[11px]">
                bithrah-lens v1
              </span>
            </div>
            <span className="font-en text-[10px] uppercase tracking-[0.22em] text-tide-400">
              ⌁ structured
            </span>
          </div>

          {!result ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                analyze(idea);
              }}
              className="space-y-5 p-5 sm:p-8"
              dir={isAr ? "rtl" : "ltr"}
            >
              <div className="rounded-xl border border-ink-700/70 bg-ink-900/60 p-3 transition focus-within:border-ember-500/60">
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder={L.placeholder}
                  rows={3}
                  disabled={loading}
                  maxLength={600}
                  className="block w-full resize-none bg-transparent px-2 py-2 text-ink-100 placeholder:text-ink-600 focus:outline-none disabled:opacity-50"
                  style={{ fontFamily: "inherit", fontSize: "16px", lineHeight: 1.55 }}
                />
                <div className="flex items-center justify-between border-t border-ink-800 pt-2 mt-2 text-[10px] uppercase tracking-[0.2em]">
                  <span className="text-ink-600">{idea.length}/600</span>
                  <button
                    type="submit"
                    data-cursor="hover"
                    disabled={loading || !idea.trim()}
                    className="rounded-lg bg-ember-500 px-4 py-2 font-medium tracking-[0.18em] text-ink-950 transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-500"
                  >
                    {loading ? L.sending : L.button}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-ink-600">
                  {L.starterLabel}
                </div>
                <div className="flex flex-wrap gap-2">
                  {L.starters.map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-cursor="hover"
                      disabled={loading}
                      onClick={() => {
                        setIdea(s);
                        analyze(s);
                      }}
                      className="rounded-full border border-ink-700/70 bg-ink-900/60 px-3.5 py-1.5 text-[12px] text-ink-300 transition hover:border-ember-500/60 hover:bg-ember-500/10 hover:text-ember-500"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {error}
                </div>
              )}

              <div className="rounded-xl border border-ink-800/70 bg-ink-950/40 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ember-500">
                  <span className="h-1 w-1 rounded-full bg-ember-500" />
                  {L.teaches}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-400" style={{ lineHeight: 1.7 }}>
                  {L.teachesBody}
                </p>
              </div>
            </form>
          ) : (
            <div className="p-5 sm:p-8" dir={result.lang === "ar" ? "rtl" : "ltr"}>
              {/* Summary */}
              <div className="rounded-xl border border-ink-800/70 bg-ink-950/40 p-4 sm:p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-tide-400">
                  <VerdictDot overall={overall} />
                  <span>
                    {(result.lang === "ar" ? LABELS.ar : LABELS.en).overall} · {overall}/10
                  </span>
                </div>
                <p className="mt-3 text-base leading-relaxed text-ink-100 sm:text-lg" style={{ lineHeight: 1.6 }}>
                  {result.summary}
                </p>
              </div>

              {/* Score grid */}
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
                <ScoreBar
                  label={(result.lang === "ar" ? LABELS.ar : LABELS.en).market}
                  score={result.scores.market}
                  delay={0}
                />
                <ScoreBar
                  label={(result.lang === "ar" ? LABELS.ar : LABELS.en).unique}
                  score={result.scores.unique}
                  delay={0.1}
                />
                <ScoreBar
                  label={(result.lang === "ar" ? LABELS.ar : LABELS.en).execution}
                  score={result.scores.execution}
                  delay={0.2}
                />
              </div>

              {/* Recommendation */}
              {result.recommendation && (
                <div className="mt-8 rounded-xl border border-ember-500/30 bg-ember-500/10 p-5 sm:p-6">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ember-500">
                    {(result.lang === "ar" ? LABELS.ar : LABELS.en).rec}
                  </div>
                  <p className="mt-3 text-base text-ink-100 sm:text-lg" style={{ lineHeight: 1.6 }}>
                    {result.recommendation}
                  </p>
                </div>
              )}

              {/* References */}
              {result.references && result.references.length > 0 && (
                <div className="mt-6">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">
                    {(result.lang === "ar" ? LABELS.ar : LABELS.en).refs}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.references.map((r) => (
                      <span
                        key={r}
                        className="rounded-full border border-ink-700/70 bg-ink-900/40 px-3.5 py-1.5 font-en text-[12px] text-ink-300"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={reset}
                  data-cursor="hover"
                  className="rounded-lg border border-ink-700/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-ink-300 transition hover:border-ember-500/60 hover:text-ember-500"
                >
                  {(result.lang === "ar" ? LABELS.ar : LABELS.en).again}
                </button>
                <a
                  href="https://bithrah.sa"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="rounded-lg bg-ember-500 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-ink-950 transition hover:bg-ember-400"
                >
                  {result.lang === "ar" ? "أطلق فكرتك على بذرة ↗" : "Launch on Bithrah ↗"}
                </a>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
