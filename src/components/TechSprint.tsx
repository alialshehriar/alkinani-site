import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import { pickQuestions, type QuizQuestion } from "../lib/quizzes";
import { readSprintStats, recordSprint, type SprintStats } from "../lib/sprintStats";
import Leaderboard from "./Leaderboard";

type Phase = "intro" | "playing" | "result";

const TOTAL_SECONDS = 60;
const POOL_SIZE = 18; // pulls 18, runs until time/pool ends

const COLORS = {
  ai:      { dot: "bg-tide-500",   text: "text-tide-400",   bg: "bg-tide-500/10",   border: "border-tide-500/30" },
  saudi:   { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30" },
  founder: { dot: "bg-ember-500",  text: "text-ember-500",  bg: "bg-ember-500/10",  border: "border-ember-500/30" },
  stack:   { dot: "bg-purple-400",  text: "text-purple-300",  bg: "bg-purple-500/10", border: "border-purple-500/30" },
} as const;

const COPY = {
  ar: {
    eyebrow: "Tech Sprint",
    title: "تحدي السرعة. ٦٠ ثانية. سؤال يولّد سؤال.",
    sub: "أسئلة سريعة في AI، التقنية السعودية، اقتصاد المؤسسين، والـStack. ضرب صحيح + سرعة = نقاط أكثر. كل خطأ ينقص ٣ نقاط.",
    start: "ابدأ التحدي",
    rules: "+10 صحيح · +5 سرعة (تحت ١.٥ ث) · +2 لكل streak · -3 خطأ",
    correct: "صحيح!",
    wrong: "خطأ",
    skip: "تخطّى",
    timer: "ث",
    score: "النقاط",
    streak: "متتالية",
    qOf: (i: number, n: number) => `سؤال ${i + 1} / ${n}`,
    again: "سباق ثاني",
    grade: { excellent: "ممتاز", good: "جيد", ok: "وسط", weak: "يحتاج تمرين" },
    final: "نتيجة السباق",
    bestRunStreak: "أطول streak الجولة",
    answeredCorrect: "إجابات صحيحة",
    answeredWrong: "إجابات خاطئة",
    timeUp: "انتهى الوقت",
    ranOut: "خلصت الأسئلة",
    cat: { ai: "AI", saudi: "السعودية", founder: "مؤسس", stack: "Stack" },
    stats: { best: "أفضل نتيجة", bestStreak: "أطول streak", total: "سباقات", flow: "Flow (5+)" },
  },
  en: {
    eyebrow: "tech sprint",
    title: "speed run. 60 seconds. one tap each.",
    sub: "quick questions on AI, Saudi tech, founder economics, and stack. correct + speed = more points. each miss costs 3.",
    start: "start the run",
    rules: "+10 correct · +5 speed (<1.5s) · +2 per streak · -3 wrong",
    correct: "correct",
    wrong: "wrong",
    skip: "skip",
    timer: "s",
    score: "score",
    streak: "streak",
    qOf: (i: number, n: number) => `q ${i + 1} / ${n}`,
    again: "run again",
    grade: { excellent: "elite", good: "solid", ok: "decent", weak: "needs reps" },
    final: "final",
    bestRunStreak: "best streak this run",
    answeredCorrect: "correct",
    answeredWrong: "wrong",
    timeUp: "time's up",
    ranOut: "out of questions",
    cat: { ai: "AI", saudi: "Saudi", founder: "founder", stack: "stack" },
    stats: { best: "best score", bestStreak: "best streak", total: "runs", flow: "flow (5+)" },
  },
} as const;

export default function TechSprint({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  const L = COPY[lang];
  const [phase, setPhase] = useState<Phase>("intro");
  const [pool, setPool] = useState<QuizQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreakInRun, setBestStreakInRun] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [stats, setStats] = useState<SprintStats>({ best: 0, bestStreak: 0, total: 0, perfectFlow: 0 });
  const [revealed, setRevealed] = useState<{ correctIdx: number; pickedIdx: number | null; fact?: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [endReason, setEndReason] = useState<"time" | "pool" | null>(null);
  const totalTimerRef = useRef<number | null>(null);
  const questionAskedAtRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("intro");

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { setStats(readSprintStats()); }, []);

  // Total run timer
  useEffect(() => {
    if (phase !== "playing") return;
    setSecondsLeft(TOTAL_SECONDS);
    if (totalTimerRef.current) window.clearInterval(totalTimerRef.current);
    totalTimerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(totalTimerRef.current!);
          if (phaseRef.current === "playing") {
            setEndReason("time");
            window.setTimeout(() => endRun(), 0);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (totalTimerRef.current) window.clearInterval(totalTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Track when the current question was shown (for speed bonus)
  useEffect(() => {
    if (phase === "playing") {
      questionAskedAtRef.current = performance.now();
    }
  }, [idx, phase]);

  const start = () => {
    setPool(pickQuestions(POOL_SIZE));
    setIdx(0);
    setScore(0);
    setStreak(0);
    setBestStreakInRun(0);
    setCorrectCount(0);
    setWrongCount(0);
    setRevealed(null);
    setEndReason(null);
    setPhase("playing");
  };

  const endRun = () => {
    if (totalTimerRef.current) window.clearInterval(totalTimerRef.current);
    setStats(recordSprint(Math.max(0, score), bestStreakInRun));
    setPhase("result");
  };

  const advance = () => {
    if (phaseRef.current !== "playing") return;
    if (idx + 1 >= pool.length) {
      setEndReason("pool");
      window.setTimeout(() => endRun(), 0);
      return;
    }
    setIdx((i) => i + 1);
    setRevealed(null);
  };

  const pick = (choiceIdx: number | null) => {
    if (phaseRef.current !== "playing") return;
    if (revealed) return; // already locked in
    const q = pool[idx];
    if (!q) return;
    const localizedQ = q[lang];
    const elapsed = (performance.now() - questionAskedAtRef.current) / 1000;
    const isCorrect = choiceIdx !== null && choiceIdx === localizedQ.correct;
    if (isCorrect) {
      const newStreak = streak + 1;
      const speedBonus = elapsed < 1.5 ? 5 : 0;
      const streakBonus = Math.min(10, newStreak * 2);
      const points = 10 + speedBonus + streakBonus;
      setStreak(newStreak);
      setBestStreakInRun((b) => Math.max(b, newStreak));
      setScore((s) => s + points);
      setCorrectCount((c) => c + 1);
    } else {
      setStreak(0);
      setScore((s) => Math.max(0, s - 3));
      setWrongCount((w) => w + 1);
    }
    setRevealed({
      correctIdx: localizedQ.correct,
      pickedIdx: choiceIdx,
      fact: localizedQ.fact,
    });
    // Auto-advance after a short reveal
    window.setTimeout(() => {
      if (phaseRef.current === "playing") advance();
    }, 1300);
  };

  const q = pool[idx];
  const localizedQ = q ? q[lang] : null;
  const colors = q ? COLORS[q.category] : COLORS.ai;

  const grade =
    score >= 200 ? L.grade.excellent :
    score >= 130 ? L.grade.good :
    score >= 70  ? L.grade.ok :
    L.grade.weak;

  return (
    <div className="overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/60 backdrop-blur-md">
      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 gap-8 p-6 sm:grid-cols-2 sm:p-10"
          >
            <div className="space-y-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-tide-400">{L.eyebrow}</div>
              <h3 className="font-bold text-ink-100" style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", lineHeight: 1.15 }}>
                {L.title}
              </h3>
              <p className="text-sm text-ink-400 sm:text-base" style={{ lineHeight: 1.6 }}>
                {L.sub}
              </p>
              <div className="rounded-xl border border-ink-700/60 bg-ink-950/40 p-4 text-[11px] uppercase tracking-[0.18em] text-ink-400">
                {L.rules}
              </div>
              <button
                type="button"
                data-cursor="hover"
                onClick={start}
                className="rounded-xl bg-gradient-to-br from-ember-500 to-tide-500 px-6 py-3 text-sm font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:brightness-110"
              >
                {L.start}
              </button>
            </div>

            {/* Stats card + Leaderboard preview */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800">
                <SprintStatCell label={L.stats.best} value={stats.best ? `${stats.best}` : "—"} accent={stats.best >= 200 ? "ember" : "ink"} />
                <SprintStatCell label={L.stats.bestStreak} value={stats.bestStreak ? `${stats.bestStreak}🔥` : "—"} />
                <SprintStatCell label={L.stats.total} value={stats.total ? `${stats.total}` : "—"} />
                <SprintStatCell label={L.stats.flow} value={stats.perfectFlow ? `${stats.perfectFlow}` : "—"} accent={stats.perfectFlow ? "tide" : "ink"} />
              </div>
              <Leaderboard lang={lang} game="sprint" variant="compact" />
            </div>
          </motion.div>
        )}

        {phase === "playing" && q && localizedQ && (
          <motion.div
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-5 sm:p-8"
            dir={isAr ? "rtl" : "ltr"}
          >
            {/* HUD */}
            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em]">
              <div className="flex items-center gap-3">
                <span className="text-ink-500">{L.qOf(idx, pool.length)}</span>
                <span className={`hidden rounded-full ${colors.bg} px-2 py-0.5 ${colors.text} sm:inline`}>
                  {(L.cat as Record<string, string>)[q.category]}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-ink-500">
                  {L.score}: <span className={`num-display ${score < 0 ? "text-red-400" : "text-ink-100"}`}>{score}</span>
                </span>
                {streak > 0 && (
                  <span className="text-ember-500">
                    {L.streak}: <span className="num-display">{streak}🔥</span>
                  </span>
                )}
                <span className={`num-display ${secondsLeft <= 10 ? "text-red-400" : "text-ember-500"}`} style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>
                  {secondsLeft}<span className="text-[10px] ms-1">{L.timer}</span>
                </span>
              </div>
            </div>

            {/* Total timer bar */}
            <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-ink-800">
              <motion.div
                animate={{ width: `${(secondsLeft / TOTAL_SECONDS) * 100}%` }}
                transition={{ duration: 0.5, ease: "linear" }}
                className={`h-full ${secondsLeft <= 10 ? "bg-red-400" : "bg-gradient-to-r from-ember-500 to-tide-500"}`}
              />
            </div>

            {/* Question */}
            <motion.h3
              key={q.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-7 font-semibold text-ink-100"
              style={{ fontSize: "clamp(1.25rem, 2.6vw, 1.85rem)", lineHeight: 1.3 }}
            >
              {localizedQ.q}
            </motion.h3>

            {/* Choices */}
            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
              {localizedQ.choices.map((choice, i) => {
                const showResult = !!revealed;
                const isCorrect = i === localizedQ.correct;
                const wasPicked = revealed?.pickedIdx === i;
                const stateClass = !showResult
                  ? "border-ink-700/70 bg-ink-900/60 hover:border-ember-500/60 hover:bg-ember-500/10"
                  : isCorrect
                  ? "border-emerald-400/70 bg-emerald-400/10"
                  : wasPicked
                  ? "border-red-400/70 bg-red-500/10"
                  : "border-ink-800 bg-ink-900/30 opacity-60";
                return (
                  <motion.button
                    key={i}
                    type="button"
                    data-cursor="hover"
                    whileTap={{ scale: 0.97 }}
                    disabled={showResult}
                    onClick={() => pick(i)}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-start text-ink-100 transition ${stateClass}`}
                  >
                    <span className="font-en text-[10px] uppercase tracking-[0.22em] text-ink-500">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1" style={{ fontSize: "clamp(0.95rem, 1.6vw, 1.05rem)", lineHeight: 1.5 }}>
                      {choice}
                    </span>
                    {showResult && isCorrect && <span className="text-emerald-400">✓</span>}
                    {showResult && wasPicked && !isCorrect && <span className="text-red-400">✗</span>}
                  </motion.button>
                );
              })}
            </div>

            {/* Reveal fact */}
            <AnimatePresence>
              {revealed?.fact && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 rounded-lg border border-ink-700/70 bg-ink-950/50 px-4 py-3 text-sm text-ink-300"
                  style={{ lineHeight: 1.6 }}
                >
                  {revealed.fact}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Skip */}
            {!revealed && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  data-cursor="hover"
                  onClick={() => pick(null)}
                  className="text-[10px] uppercase tracking-[0.22em] text-ink-500 transition hover:text-ink-200"
                >
                  {L.skip}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {phase === "result" && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-6 sm:p-10"
            dir={isAr ? "rtl" : "ltr"}
          >
            <div className="rounded-2xl border border-ember-500/30 bg-gradient-to-br from-ember-500/10 via-ink-950 to-tide-500/10 p-6 sm:p-10">
              <div className="text-[10px] uppercase tracking-[0.22em] text-ember-500">
                {L.final} · {endReason === "time" ? L.timeUp : L.ranOut}
              </div>
              <div
                className="num-display mt-3 text-ink-100"
                style={{ fontSize: "clamp(3rem, 9vw, 5rem)", letterSpacing: "-0.03em", lineHeight: 1 }}
              >
                {Math.max(0, score)}
              </div>
              <div className="mt-2 text-sm uppercase tracking-[0.22em] text-ember-500">{grade}</div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <ResultStat label={L.bestRunStreak} value={`${bestStreakInRun}🔥`} />
                <ResultStat label={L.answeredCorrect} value={`${correctCount}`} accent="emerald" />
                <ResultStat label={L.answeredWrong} value={`${wrongCount}`} accent="red" />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                data-cursor="hover"
                onClick={start}
                className="rounded-xl bg-ember-500 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:bg-ember-400"
              >
                {L.again}
              </button>
            </div>

            <div className="mt-6">
              <Leaderboard
                lang={lang}
                game="sprint"
                variant="full"
                pendingScore={{
                  score: Math.max(0, score),
                  meta: {
                    correct: correctCount,
                    wrong: wrongCount,
                    bestStreak: bestStreakInRun,
                    endReason,
                  },
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function SprintStatCell({
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
      <div className="text-[9px] uppercase tracking-[0.22em] text-ink-500 sm:text-[10px]">{label}</div>
      <div className={`num-display mt-2 ${colorMap[accent]}`} style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.6rem)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  accent = "ink",
}: {
  label: string;
  value: string;
  accent?: "ink" | "emerald" | "red";
}) {
  const map = {
    ink: "text-ink-100",
    emerald: "text-emerald-400",
    red: "text-red-300",
  } as const;
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
      <div className="text-[9px] uppercase tracking-[0.22em] text-ink-500 sm:text-[10px]">{label}</div>
      <div className={`num-display mt-2 ${map[accent]}`} style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.6rem)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}
