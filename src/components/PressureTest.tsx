import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import { SCENARIOS, type Scenario } from "../lib/quests";
import { readStats, recordPlay, type Stats } from "../lib/stats";

type Phase = "idle" | "loading-critique" | "rebut" | "judging" | "verdict";

type Verdict = {
  score: number;
  grade: string;
  verdict: string;
  ali: string;
};

const REBUT_SECONDS = 60;

const COPY = {
  ar: {
    eyebrow: "/05 لعبة بذرة · اختبار الضغط",
    title: "ادخل في غرفة التفاوض.",
    sub: "اكتب فكرة، AI يوجّه لك ضربة محقق فيها، وعندك ٦٠ ثانية ترد. كل جولة تتعلم كيف تدافع عن فكرة.",
    chooseLabel: "أو اختار سيناريو جاهز:",
    yourIdea: "فكرتك",
    placeholder: "مثال: تطبيق توصيل قهوة مختصة بالاشتراك الشهري",
    start: "ابدأ التحدي",
    starting: "يولّد الاعتراض…",
    critique: "اعتراض المستثمر",
    rebuttalLabel: "ردّك (٦٠ ثانية)",
    rebuttalPlaceholder: "ابعث رد قصير + رقم محدد + خطة واضحة.",
    submit: "ارفع الرد",
    judging: "AI يحكم على ردّك…",
    timeUp: "خلصت الثواني.",
    verdict: "الحكم",
    aliTip: "تعليق علي",
    again: "تحدي ثاني",
    differentIdea: "فكرة جديدة",
    stats: { best: "أفضل نتيجة", streak: "أيام متتالية", total: "إجمالي الجولات", perfect: "نتائج ممتازة" },
    feedback: {
      perfect: "هذي إجابة المؤسس الحقيقي.",
      strong:  "إجابة قوية. تنقصها رقم أو تفصيل.",
      ok:      "وسط. لمست النقطة بس ما طحت بعمق.",
      weak:    "ضعيف. ارجع لورا، اقرأ الاعتراض مرة ثانية.",
      fail:    "تهرّبت من السؤال. كل مؤسس يقع هنا أول مرة.",
    },
    rules: "القواعد: ٦٠ ثانية. رد محدد + رقم + خطة. كل جولة فكرة جديدة.",
    streakLost: "ضاعت السلسلة. ابدأ من واحد.",
  },
  en: {
    eyebrow: "/05 bithrah lab · pressure test",
    title: "Step into the deal room.",
    sub: "Type an idea. The AI investor lands one brutal objection. You have 60 seconds to defend it. Each round trains how you handle real heat.",
    chooseLabel: "Or pick a scenario:",
    yourIdea: "your idea",
    placeholder: "Example: monthly subscription delivering specialty coffee in Riyadh.",
    start: "Start the challenge",
    starting: "Generating the objection…",
    critique: "Investor objection",
    rebuttalLabel: "Your rebuttal (60s)",
    rebuttalPlaceholder: "Short answer. One specific number. A clear plan.",
    submit: "Submit",
    judging: "AI is judging your answer…",
    timeUp: "Time's up.",
    verdict: "Verdict",
    aliTip: "Ali's tip",
    again: "Run another",
    differentIdea: "New idea",
    stats: { best: "Best score", streak: "Day streak", total: "Total runs", perfect: "Perfect (90+)" },
    feedback: {
      perfect: "Founder-grade answer.",
      strong:  "Solid. Missing one number or detail.",
      ok:      "OK. You touched it but didn't dig in.",
      weak:    "Weak. Re-read the objection.",
      fail:    "You dodged the question. Every founder falls here first.",
    },
    rules: "rules: 60 seconds. specific answer + one number + a plan. each round = new idea.",
    streakLost: "streak broken. start over.",
  },
} as const;

function classifyTone(score: number): keyof (typeof COPY.ar)["feedback"] {
  if (score >= 90) return "perfect";
  if (score >= 75) return "strong";
  if (score >= 55) return "ok";
  if (score >= 35) return "weak";
  return "fail";
}

function gradeColor(score: number) {
  if (score >= 75) return { ring: "ring-ember-500/40", text: "text-ember-500", glow: "shadow-[0_0_60px_-10px_oklch(0.72_0.17_50_/_0.6)]" };
  if (score >= 55) return { ring: "ring-tide-500/40", text: "text-tide-400", glow: "shadow-[0_0_60px_-10px_oklch(0.78_0.12_210_/_0.5)]" };
  return { ring: "ring-red-500/40", text: "text-red-400", glow: "shadow-[0_0_60px_-10px_oklch(0.65_0.18_25_/_0.5)]" };
}

export default function PressureTest({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  const L = COPY[lang];
  const [phase, setPhase] = useState<Phase>("idle");
  const [idea, setIdea] = useState("");
  const [critique, setCritique] = useState("");
  const [rebuttal, setRebuttal] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(REBUT_SECONDS);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [stats, setStats] = useState<Stats>({ best: 0, streak: 0, total: 0, lastPlay: "", perfect: 0 });
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  // Load stats once
  useEffect(() => { setStats(readStats()); }, []);

  // Timer for rebut phase
  useEffect(() => {
    if (phase !== "rebut") return;
    setSecondsLeft(REBUT_SECONDS);
    submittedRef.current = false;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(timerRef.current!);
          // auto-submit if user typed something, else show fail
          if (!submittedRef.current) submitRebut(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const requestCritique = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setError(null);
    setIdea(t);
    setRebuttal("");
    setVerdict(null);
    setPhase("loading-critique");
    try {
      const res = await fetch("/api/pressure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "critique", idea: t }),
      });
      if (!res.ok) {
        setError(isAr ? "فشل الاتصال. جرب مرة ثانية." : "Network failed. Try again.");
        setPhase("idle");
        return;
      }
      const data = (await res.json()) as { critique?: string };
      const c = (data.critique || "").trim();
      if (!c) {
        setError(isAr ? "ما طلع اعتراض. صياغة الفكرة محتاجة وضوح." : "No objection generated. Sharpen the idea.");
        setPhase("idle");
        return;
      }
      setCritique(c);
      setPhase("rebut");
    } catch {
      setError(isAr ? "فشل الاتصال. جرب مرة ثانية." : "Network failed. Try again.");
      setPhase("idle");
    }
  };

  const submitRebut = async (timedOut = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPhase("judging");
    const r = rebuttal.trim();
    const safeRebut = r.length > 0 ? r : isAr ? "(تجاوز الوقت بدون إجابة)" : "(no answer, time ran out)";
    try {
      const res = await fetch("/api/pressure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "verdict", idea, critique, rebuttal: safeRebut }),
      });
      if (!res.ok) {
        setError(isAr ? "فشل الحكم. جرب مرة ثانية." : "Judging failed. Try again.");
        setPhase("rebut");
        submittedRef.current = false;
        return;
      }
      const data = (await res.json()) as Verdict;
      // If timed out and they wrote nothing, force a low score
      const finalScore = timedOut && r.length === 0 ? Math.min(data.score, 20) : data.score;
      const final: Verdict = { ...data, score: finalScore };
      setVerdict(final);
      setStats(recordPlay(final.score));
      setPhase("verdict");
    } catch {
      setError(isAr ? "فشل الحكم. جرب مرة ثانية." : "Judging failed. Try again.");
      setPhase("rebut");
      submittedRef.current = false;
    }
  };

  const reset = (keepIdea: boolean) => {
    setError(null);
    setVerdict(null);
    setCritique("");
    setRebuttal("");
    setPhase("idle");
    if (!keepIdea) setIdea("");
  };

  const tone = verdict ? classifyTone(verdict.score) : "ok";
  const colors = verdict ? gradeColor(verdict.score) : gradeColor(60);

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
        {/* Header */}
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

        {/* Stats strip */}
        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-4">
          <StatCell label={L.stats.best} value={stats.best ? `${stats.best}` : "—"} accent={stats.best >= 80 ? "ember" : "ink"} />
          <StatCell label={L.stats.streak} value={stats.streak > 0 ? `${stats.streak}🔥` : "—"} />
          <StatCell label={L.stats.total} value={stats.total ? `${stats.total}` : "—"} />
          <StatCell label={L.stats.perfect} value={stats.perfect > 0 ? `${stats.perfect}` : "—"} accent={stats.perfect > 0 ? "tide" : "ink"} />
        </div>

        {/* Game card */}
        <motion.div
          layout
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.8 }}
          className={`mt-8 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 backdrop-blur-md ring-1 ${verdict ? colors.ring : "ring-transparent"} transition-shadow ${verdict ? colors.glow : ""}`}
        >
          {/* chrome */}
          <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
              <span className="h-2.5 w-2.5 rounded-full bg-ember-500/80 shrink-0" />
              <span className="ms-3 truncate font-en text-[10px] uppercase tracking-[0.2em] text-ink-500 sm:text-[11px]">
                pressure-test · v1
              </span>
            </div>
            <PhaseBadge phase={phase} lang={lang} />
          </div>

          <div className="relative p-5 sm:p-8" dir={isAr ? "rtl" : "ltr"}>
            <AnimatePresence mode="wait">
              {phase === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-5"
                >
                  <div className="rounded-xl border border-ink-700/70 bg-ink-900/60 p-3 transition focus-within:border-ember-500/60">
                    <div className="px-2 pt-1 text-[10px] uppercase tracking-[0.22em] text-ink-500">
                      {L.yourIdea}
                    </div>
                    <textarea
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      placeholder={L.placeholder}
                      rows={2}
                      maxLength={400}
                      className="block w-full resize-none bg-transparent px-2 py-2 text-ink-100 placeholder:text-ink-600 focus:outline-none"
                      style={{ fontFamily: "inherit", fontSize: "16px", lineHeight: 1.55 }}
                    />
                    <div className="flex items-center justify-between border-t border-ink-800 pt-2 mt-2 text-[10px] uppercase tracking-[0.2em]">
                      <span className="text-ink-600">{idea.length}/400</span>
                      <button
                        type="button"
                        data-cursor="hover"
                        disabled={!idea.trim()}
                        onClick={() => requestCritique(idea)}
                        className="rounded-lg bg-ember-500 px-4 py-2 font-medium tracking-[0.18em] text-ink-950 transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-500"
                      >
                        {L.start}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-ink-600">
                      {L.chooseLabel}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SCENARIOS.map((s) => (
                        <ScenarioChip
                          key={s.id}
                          s={s}
                          lang={lang}
                          onPick={(text) => {
                            setIdea(text);
                            requestCritique(text);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-600">{L.rules}</p>

                  {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                      {error}
                    </div>
                  )}
                </motion.div>
              )}

              {phase === "loading-critique" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex min-h-[12rem] items-center justify-center text-center"
                >
                  <div className="space-y-4">
                    <ThinkingDots />
                    <p className="text-sm text-ink-400">{L.starting}</p>
                  </div>
                </motion.div>
              )}

              {phase === "rebut" && (
                <motion.div
                  key="rebut"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-5"
                >
                  <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 sm:p-5">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-red-300">
                      {L.critique}
                    </div>
                    <p className="mt-3 text-base leading-relaxed text-ink-100 sm:text-lg" style={{ lineHeight: 1.6 }}>
                      {critique}
                    </p>
                  </div>

                  <Timer secondsLeft={secondsLeft} total={REBUT_SECONDS} />

                  <div className="rounded-xl border border-ink-700/70 bg-ink-900/60 p-3 transition focus-within:border-ember-500/60">
                    <div className="px-2 pt-1 text-[10px] uppercase tracking-[0.22em] text-ember-500">
                      {L.rebuttalLabel}
                    </div>
                    <textarea
                      value={rebuttal}
                      onChange={(e) => setRebuttal(e.target.value)}
                      placeholder={L.rebuttalPlaceholder}
                      rows={3}
                      autoFocus
                      maxLength={500}
                      className="block w-full resize-none bg-transparent px-2 py-2 text-ink-100 placeholder:text-ink-600 focus:outline-none"
                      style={{ fontFamily: "inherit", fontSize: "16px", lineHeight: 1.55 }}
                    />
                    <div className="flex items-center justify-between border-t border-ink-800 pt-2 mt-2 text-[10px] uppercase tracking-[0.2em]">
                      <span className="text-ink-600">{rebuttal.length}/500</span>
                      <button
                        type="button"
                        data-cursor="hover"
                        disabled={!rebuttal.trim()}
                        onClick={() => submitRebut(false)}
                        className="rounded-lg bg-ember-500 px-4 py-2 font-medium tracking-[0.18em] text-ink-950 transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-500"
                      >
                        {L.submit}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {phase === "judging" && (
                <motion.div
                  key="judging"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex min-h-[12rem] items-center justify-center text-center"
                >
                  <div className="space-y-4">
                    <ThinkingDots />
                    <p className="text-sm text-ink-400">{L.judging}</p>
                  </div>
                </motion.div>
              )}

              {phase === "verdict" && verdict && (
                <motion.div
                  key="verdict"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-2">
                    {/* Big score */}
                    <div className="flex items-center gap-5">
                      <ScoreRing score={verdict.score} />
                      <div>
                        <div className="font-en text-[10px] uppercase tracking-[0.22em] text-ink-500">
                          {L.verdict}
                        </div>
                        <div className={`num-display ${colors.text}`} style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                          {verdict.grade}
                        </div>
                        <div className="mt-2 text-xs uppercase tracking-[0.22em] text-ink-400">
                          {L.feedback[tone]}
                        </div>
                      </div>
                    </div>

                    {/* Verdict text */}
                    <div className="rounded-xl border border-ink-800 bg-ink-950/40 p-4 sm:p-5">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-tide-400">
                        {L.critique}
                      </div>
                      <p className="mt-2 text-sm text-ink-300" style={{ lineHeight: 1.6 }}>
                        {critique}
                      </p>
                      <div className="my-4 h-px w-full bg-ink-800" />
                      <p className="text-base text-ink-100" style={{ lineHeight: 1.6 }}>
                        {verdict.verdict}
                      </p>
                    </div>
                  </div>

                  {verdict.ali && (
                    <div className="rounded-xl border border-ember-500/30 bg-ember-500/10 p-5">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-ember-500">
                        {L.aliTip}
                      </div>
                      <p className="mt-2 text-base text-ink-100" style={{ lineHeight: 1.6 }}>
                        {verdict.ali}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      data-cursor="hover"
                      onClick={() => requestCritique(idea)}
                      className="rounded-lg bg-ember-500 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:bg-ember-400"
                    >
                      {L.again}
                    </button>
                    <button
                      type="button"
                      data-cursor="hover"
                      onClick={() => reset(false)}
                      className="rounded-lg border border-ink-700/70 px-4 py-2 text-xs uppercase tracking-[0.18em] text-ink-300 transition hover:border-ember-500/60 hover:text-ember-500"
                    >
                      {L.differentIdea}
                    </button>
                    <ShareCard verdict={verdict} idea={idea} lang={lang} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function StatCell({
  label,
  value,
  accent = "ink",
}: {
  label: string;
  value: string;
  accent?: "ink" | "ember" | "tide";
}) {
  const colorMap = {
    ink: "text-ink-100",
    ember: "text-ember-500",
    tide: "text-tide-400",
  } as const;
  return (
    <div className="bg-ink-950 p-4 sm:p-5">
      <div className="text-[9px] uppercase tracking-[0.22em] text-ink-500 sm:text-[10px]">
        {label}
      </div>
      <div className={`num-display mt-2 ${colorMap[accent]}`} style={{ fontSize: "clamp(1.4rem, 3vw, 1.85rem)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

function PhaseBadge({ phase, lang }: { phase: Phase; lang: Lang }) {
  const isAr = lang === "ar";
  const map: Record<Phase, { dot: string; label: { ar: string; en: string } }> = {
    "idle":             { dot: "bg-ink-600",      label: { ar: "جاهز",  en: "ready" } },
    "loading-critique": { dot: "bg-ember-500",    label: { ar: "يولّد", en: "loading" } },
    "rebut":            { dot: "bg-red-400",      label: { ar: "ضغط",   en: "pressure" } },
    "judging":          { dot: "bg-tide-500",     label: { ar: "حكم",   en: "judging" } },
    "verdict":          { dot: "bg-emerald-400",  label: { ar: "نتيجة", en: "result" } },
  };
  const c = map[phase];
  return (
    <span className="flex items-center gap-2">
      <span className="relative grid h-2 w-2 place-items-center">
        <span className={`absolute inset-0 rounded-full ${c.dot} opacity-60 motion-safe:animate-ping`} />
        <span className={`relative h-2 w-2 rounded-full ${c.dot}`} />
      </span>
      <span className="font-en text-[10px] uppercase tracking-[0.22em] text-ink-300">
        {isAr ? c.label.ar : c.label.en}
      </span>
    </span>
  );
}

function Timer({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const pct = (secondsLeft / total) * 100;
  const danger = secondsLeft <= 10;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500">timer</span>
        <span
          className={`num-display ${danger ? "text-red-400" : "text-ember-500"}`}
          style={{ fontSize: "clamp(1.5rem, 3vw, 1.85rem)" }}
        >
          {secondsLeft}s
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "linear" }}
          className={`h-full ${danger ? "bg-red-400" : "bg-gradient-to-r from-ember-500 to-tide-500"}`}
        />
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex justify-center gap-2">
      {[0, 0.15, 0.3].map((d, i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-ember-500"
          style={{ animation: `dotPulse 1.4s ease-in-out infinite ${d}s` }}
        />
      ))}
      <style>{`@keyframes dotPulse { 0%,100%{opacity:0.3;transform:scale(0.85)} 50%{opacity:1;transform:scale(1.1)} }`}</style>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const colors = gradeColor(score);
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className={colors.text}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="8" />
      <motion.circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: off }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="55" textAnchor="middle" fontSize="22" fontWeight="700" fill="currentColor" fontFamily="inherit">
        {score}
      </text>
    </svg>
  );
}

function ScenarioChip({
  s,
  lang,
  onPick,
}: {
  s: Scenario;
  lang: Lang;
  onPick: (text: string) => void;
}) {
  const text = lang === "ar" ? s.ar : s.en;
  const cat = s.category;
  return (
    <button
      type="button"
      data-cursor="hover"
      onClick={() => onPick(text)}
      className="group rounded-full border border-ink-700/70 bg-ink-900/60 px-3.5 py-1.5 text-[12px] text-ink-300 transition hover:border-ember-500/60 hover:bg-ember-500/10 hover:text-ember-500"
      title={text}
    >
      <span className="font-en text-ink-500 me-2 text-[10px] uppercase tracking-[0.18em] group-hover:text-ember-500">
        {cat}
      </span>
      {text.length > 56 ? text.slice(0, 56).trim() + "…" : text}
    </button>
  );
}

function ShareCard({
  verdict,
  idea,
  lang,
}: {
  verdict: Verdict;
  idea: string;
  lang: Lang;
}) {
  const isAr = lang === "ar";
  const onShare = async () => {
    const text = isAr
      ? `سجّلت ${verdict.score}/100 (${verdict.grade}) في اختبار الضغط على alkinani.com 🔥\nفكرتي: ${idea}\nجرّبه: alkinani-site.pages.dev/#lab`
      : `I scored ${verdict.score}/100 (${verdict.grade}) on Pressure Test 🔥\nIdea: ${idea}\nTry it: alkinani-site.pages.dev/#lab`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert(isAr ? "اتنسخ! الصق في تويتر/واتساب" : "Copied. Paste anywhere.");
      } catch { /* ignore */ }
    }
  };
  return (
    <button
      type="button"
      data-cursor="hover"
      onClick={onShare}
      className="rounded-lg border border-tide-500/40 px-4 py-2 text-xs uppercase tracking-[0.18em] text-tide-400 transition hover:bg-tide-500/10"
    >
      {isAr ? "شارك النتيجة" : "Share score"}
    </button>
  );
}

