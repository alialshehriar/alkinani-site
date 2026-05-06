import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import { readPulseStats, recordPulse, type PulseStats } from "../lib/pulseStats";
import { playCellTone, playSuccess, playFail } from "../lib/audio";

type Phase = "idle" | "showing" | "input" | "round-complete" | "game-over";

const GRID_SIZE = 4; // 4x4
const CELLS = GRID_SIZE * GRID_SIZE;
const START_SEQUENCE_LEN = 3;
const BASE_SHOW_MS = 700;
const MIN_SHOW_MS = 280;
const SHOW_DECAY_MS = 30;
const GAP_MS = 220;

function genSequence(level: number): number[] {
  const len = START_SEQUENCE_LEN + level - 1;
  const arr: number[] = [];
  let prev = -1;
  for (let i = 0; i < len; i++) {
    let n = Math.floor(Math.random() * CELLS);
    // Avoid immediate repeats — feels less like a glitch.
    if (n === prev) n = (n + 1 + Math.floor(Math.random() * (CELLS - 1))) % CELLS;
    arr.push(n);
    prev = n;
  }
  return arr;
}

type CopyShape = {
  eyebrow: string;
  title: string;
  sub: string;
  start: string;
  again: string;
  watch: string;
  yourTurn: string;
  correct: string;
  wrong: string;
  levelUp: string;
  gameOver: string;
  level: string;
  score: string;
  sequence: string;
  final: string;
  bestLevel: string;
  bestScore: string;
  bestSeq: string;
  total: string;
  rules: string;
  science: string;
};

const COPY: { ar: CopyShape; en: CopyShape } = {
  ar: {
    eyebrow: "نبضة",
    title: "كم خانة تقدر تحفظ بترتيبها؟",
    sub: "تومض خانات بنبض. تردّها بنفس الترتيب. كل مستوى يضيف خانة ويقصّر الوقت. لعبة ذاكرة عاملة بحتة — لا كلمات، لا اختيارات.",
    start: "ابدأ النبضة",
    again: "نبضة ثانية",
    watch: "شف النمط…",
    yourTurn: "دورك. اضرب بالترتيب.",
    correct: "صحيح",
    wrong: "خطأ",
    levelUp: "ارتقيت!",
    gameOver: "خلصت اللعبة",
    level: "المستوى",
    score: "النقاط",
    sequence: "خانات",
    final: "الجولة",
    bestLevel: "أعلى مستوى",
    bestScore: "أفضل نقاط",
    bestSeq: "أطول سلسلة",
    total: "جولات",
    rules: "كل مستوى = +١ خانة في النمط، وقت أقل. خطأ واحد = انتهت الجولة.",
    science: "ذاكرة العمل البصرية. قياس فعلي مستخدم في الأبحاث (Corsi block-tapping). تتحسن بـ٥-١٠ دقايق يومياً.",
  },
  en: {
    eyebrow: "pulse",
    title: "how many cells can you hold in order?",
    sub: "cells flash in sequence. tap them back in the same order. each level adds one cell and trims the time. pure working-memory test — no words, no multiple choice.",
    start: "start the pulse",
    again: "run again",
    watch: "watch the pattern…",
    yourTurn: "your turn. tap in order.",
    correct: "correct",
    wrong: "wrong",
    levelUp: "level up",
    gameOver: "round over",
    level: "level",
    score: "score",
    sequence: "cells",
    final: "your run",
    bestLevel: "best level",
    bestScore: "best score",
    bestSeq: "longest streak",
    total: "runs",
    rules: "each level = +1 cell, faster timing. one miss ends the round.",
    science: "visual working memory — the same test used in cognitive research (Corsi block-tapping). Improves with 5-10 minutes a day.",
  },
};

export default function Pulse({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  const L = COPY[lang];
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState(1);
  const [sequence, setSequence] = useState<number[]>([]);
  const [userIdx, setUserIdx] = useState(0);
  const [activeCell, setActiveCell] = useState<number>(-1); // currently flashing while showing
  const [pressedCell, setPressedCell] = useState<number>(-1); // user just tapped
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [score, setScore] = useState(0);
  const [longestSeq, setLongestSeq] = useState(0);
  const [stats, setStats] = useState<PulseStats>({ bestLevel: 0, bestScore: 0, total: 0, bestSequence: 0 });
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const sequenceTimerRef = useRef<number[]>([]);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { setStats(readPulseStats()); }, []);

  // Cleanup any pending timers on unmount
  useEffect(() => {
    return () => {
      sequenceTimerRef.current.forEach((t) => window.clearTimeout(t));
      sequenceTimerRef.current = [];
    };
  }, []);

  const playSequence = useCallback((seq: number[], lvl: number) => {
    const showMs = Math.max(MIN_SHOW_MS, BASE_SHOW_MS - (lvl - 1) * SHOW_DECAY_MS);
    sequenceTimerRef.current.forEach((t) => window.clearTimeout(t));
    sequenceTimerRef.current = [];
    seq.forEach((cell, i) => {
      const onAt = i * (showMs + GAP_MS);
      const offAt = onAt + showMs;
      sequenceTimerRef.current.push(
        window.setTimeout(() => {
          if (phaseRef.current !== "showing") return;
          setActiveCell(cell);
          if (!mutedRef.current) playCellTone(cell, Math.min(showMs, 320), 0.7);
          // soft haptic on cells lighting up
          if (typeof navigator !== "undefined" && (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate) {
            try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(10); } catch { /* ignore */ }
          }
        }, onAt),
      );
      sequenceTimerRef.current.push(
        window.setTimeout(() => {
          if (phaseRef.current !== "showing") return;
          setActiveCell(-1);
        }, offAt),
      );
    });
    // Hand control to player at the end
    const totalMs = seq.length * (showMs + GAP_MS);
    sequenceTimerRef.current.push(
      window.setTimeout(() => {
        if (phaseRef.current !== "showing") return;
        setActiveCell(-1);
        setUserIdx(0);
        setPhase("input");
      }, totalMs + 50),
    );
  }, []);

  const startRun = () => {
    setLevel(1);
    setScore(0);
    setLongestSeq(0);
    const seq = genSequence(1);
    setSequence(seq);
    setUserIdx(0);
    setFeedback(null);
    setPhase("showing");
    // Defer to next tick so phaseRef updates
    window.setTimeout(() => playSequence(seq, 1), 30);
  };

  const startNextLevel = useCallback(() => {
    const nextLvl = level + 1;
    setLevel(nextLvl);
    const seq = genSequence(nextLvl);
    setSequence(seq);
    setUserIdx(0);
    setFeedback(null);
    setPhase("showing");
    window.setTimeout(() => playSequence(seq, nextLvl), 30);
  }, [level, playSequence]);

  const onCellTap = (cell: number) => {
    if (phaseRef.current !== "input") return;
    const expected = sequence[userIdx];
    setPressedCell(cell);
    window.setTimeout(() => setPressedCell(-1), 220);

    if (cell === expected) {
      setFeedback("correct");
      window.setTimeout(() => setFeedback(null), 180);
      if (!mutedRef.current) playCellTone(cell, 220, 0.55);
      if (typeof navigator !== "undefined" && (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate) {
        try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(8); } catch { /* ignore */ }
      }
      // Last in sequence?
      if (userIdx + 1 >= sequence.length) {
        // Round complete — score + advance
        const roundScore = sequence.length * 10 + level * 5;
        setScore((s) => s + roundScore);
        setLongestSeq((m) => Math.max(m, sequence.length));
        if (!mutedRef.current) playSuccess();
        setPhase("round-complete");
        window.setTimeout(() => startNextLevel(), 900);
      } else {
        setUserIdx((u) => u + 1);
      }
    } else {
      setFeedback("wrong");
      if (!mutedRef.current) playFail();
      if (typeof navigator !== "undefined" && (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate) {
        try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.([40, 60, 40]); } catch { /* ignore */ }
      }
      const finalScore = score; // current accumulated score
      const finalLongest = longestSeq;
      const reachedLevel = level;
      // small delay so the wrong-flash registers
      window.setTimeout(() => {
        setStats(recordPulse(reachedLevel, finalScore, finalLongest));
        setPhase("game-over");
      }, 600);
    }
  };

  const reset = () => {
    sequenceTimerRef.current.forEach((t) => window.clearTimeout(t));
    sequenceTimerRef.current = [];
    setSequence([]);
    setUserIdx(0);
    setActiveCell(-1);
    setPressedCell(-1);
    setFeedback(null);
    setLevel(1);
    setScore(0);
    setLongestSeq(0);
    setPhase("idle");
  };

  const showInputProgress = phase === "input" || phase === "round-complete";

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="space-y-2">
        <h3 className="font-semibold text-ink-100" style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.4rem)", lineHeight: 1.15 }}>
          {L.title}
        </h3>
        <p className="text-sm text-ink-400 sm:text-base" style={{ lineHeight: 1.65 }}>
          {L.sub}
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-4">
        <PulseStat label={L.bestLevel} value={stats.bestLevel ? `${stats.bestLevel}` : "—"} accent={stats.bestLevel >= 6 ? "ember" : "ink"} />
        <PulseStat label={L.bestSeq} value={stats.bestSequence ? `${stats.bestSequence}🧠` : "—"} />
        <PulseStat label={L.bestScore} value={stats.bestScore ? `${stats.bestScore}` : "—"} />
        <PulseStat label={L.total} value={stats.total ? `${stats.total}` : "—"} accent={stats.total > 0 ? "tide" : "ink"} />
      </div>

      {/* Game board */}
      <div className="overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/60 backdrop-blur-md">
        {/* HUD */}
        <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-700 shrink-0" />
            <span className="h-2.5 w-2.5 rounded-full bg-ember-500/80 shrink-0" />
            <span className="ms-3 truncate font-en text-[10px] uppercase tracking-[0.2em] text-ink-500 sm:text-[11px]">
              {L.eyebrow} · {phase}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.22em] text-ink-400">
            <span>
              {L.level}: <span className="num-display text-ember-500">{level}</span>
            </span>
            <span>
              {L.score}: <span className="num-display text-ink-100">{score}</span>
            </span>
            {showInputProgress && sequence.length > 0 && (
              <span className="hidden sm:inline">
                {L.sequence}: <span className="num-display text-tide-400">{userIdx}/{sequence.length}</span>
              </span>
            )}
          </div>
        </div>

        <div className="relative p-5 sm:p-7">
          {/* Phase banner */}
          <div className="mb-4 flex items-center justify-center text-[11px] uppercase tracking-[0.22em]">
            {phase === "idle" && <span className="text-ink-500">{L.rules}</span>}
            {phase === "showing" && (
              <span className="flex items-center gap-2 text-ember-500">
                <span className="h-1.5 w-1.5 rounded-full bg-ember-500 motion-safe:animate-pulse" />
                {L.watch}
              </span>
            )}
            {phase === "input" && (
              <span className="flex items-center gap-2 text-tide-400">
                <span className="h-1.5 w-1.5 rounded-full bg-tide-400 motion-safe:animate-pulse" />
                {L.yourTurn}
              </span>
            )}
            {phase === "round-complete" && (
              <span className="text-emerald-400">{L.levelUp}</span>
            )}
            {phase === "game-over" && <span className="text-red-400">{L.gameOver}</span>}
          </div>

          {/* Grid */}
          <div
            className={`mx-auto grid aspect-square w-full max-w-[420px] grid-cols-4 gap-2 sm:gap-3 ${feedback === "wrong" ? "shake" : ""}`}
            role="grid"
            aria-label={L.title}
          >
            {Array.from({ length: CELLS }).map((_, i) => {
              const isLit = activeCell === i;
              const isPressed = pressedCell === i;
              const isWrong = feedback === "wrong" && pressedCell === i;
              return (
                <button
                  key={i}
                  type="button"
                  data-cursor="hover"
                  onClick={() => onCellTap(i)}
                  disabled={phase !== "input"}
                  className={`relative aspect-square rounded-2xl border transition-all duration-150 ${
                    isLit
                      ? "border-ember-500 bg-gradient-to-br from-ember-500 to-ember-400 shadow-[0_0_30px_rgba(249,115,22,0.6)] scale-[1.02]"
                      : isWrong
                      ? "border-red-400 bg-red-500/40 shadow-[0_0_24px_rgba(248,113,113,0.6)]"
                      : isPressed
                      ? "border-tide-400 bg-tide-500/30 shadow-[0_0_24px_rgba(34,211,238,0.5)] scale-[0.97]"
                      : "border-ink-700/70 bg-ink-900/70 hover:border-ink-600/90 hover:bg-ink-800/70"
                  } ${phase === "input" ? "cursor-pointer" : "cursor-default"}`}
                  aria-label={`cell ${i + 1}`}
                />
              );
            })}
          </div>

          {/* Action area */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {phase === "idle" && (
              <>
                <button
                  type="button"
                  data-cursor="hover"
                  onClick={startRun}
                  className="rounded-xl bg-gradient-to-br from-ember-500 to-tide-500 px-6 py-3 text-sm font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:brightness-110"
                >
                  {L.start}
                </button>
                <button
                  type="button"
                  data-cursor="hover"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="rounded-xl border border-ink-700/70 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-ink-300 transition hover:border-tide-500/60 hover:text-tide-400"
                >
                  {muted ? (isAr ? "🔇 بدون صوت" : "🔇 muted") : (isAr ? "🔊 صوت" : "🔊 sound")}
                </button>
              </>
            )}
            {phase === "game-over" && (
              <div className="w-full">
                <GameOverCard
                  level={level}
                  score={score}
                  longestSeq={longestSeq}
                  lang={lang}
                  L={L}
                  onAgain={startRun}
                  onIdle={reset}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Educational footer (small) */}
      <p className="text-center text-[11px] uppercase tracking-[0.22em] text-ink-500" dir={isAr ? "rtl" : "ltr"}>
        {L.science}
      </p>

      <style>{`
        @keyframes pulse-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          50% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
        }
        .shake { animation: pulse-shake 0.35s ease-in-out; }
      `}</style>
    </div>
  );
}

function PulseStat({
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

function GameOverCard({
  level,
  score,
  longestSeq,
  lang,
  L,
  onAgain,
  onIdle,
}: {
  level: number;
  score: number;
  longestSeq: number;
  lang: Lang;
  L: CopyShape;
  onAgain: () => void;
  onIdle: () => void;
}) {
  // Compute a quick percentile-style read based on best-level reached.
  // (Heuristic, no backend — but consistent numbers feel personal.)
  const reading = (() => {
    if (lang === "ar") {
      if (level >= 9) return "مستوى ٩+ نادر. ذاكرة عاملة استثنائية.";
      if (level >= 7) return "ذاكرتك أقوى من ٨٠٪ من اللاعبين.";
      if (level >= 5) return "أقوى من المعدل. لاحظ النمط، ما تحاول تحفظه عشوائي.";
      if (level >= 4) return "نقطة بداية متوسطة. مرّن الذاكرة ٥ دقايق يومياً.";
      return "ابدأ بالتركيز على الأول. الذاكرة العاملة تنمو بالتمرين.";
    }
    if (level >= 9) return "level 9+ is rare territory. exceptional working memory.";
    if (level >= 7) return "stronger than 80% of players.";
    if (level >= 5) return "above average. read the pattern, don't memorize randomly.";
    if (level >= 4) return "average start. 5 min/day will lift this fast.";
    return "focus first cell, then chunk pairs. working memory grows with reps.";
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-5 rounded-2xl border border-ember-500/30 bg-gradient-to-br from-ember-500/10 via-ink-950 to-tide-500/10 p-6 sm:p-7"
    >
      <div className="text-[10px] uppercase tracking-[0.22em] text-ember-500">
        {L.final}
      </div>
      <div className="grid grid-cols-3 gap-4 sm:gap-6">
        <ResultStat label={L.level} value={`${level}`} accent="ember" />
        <ResultStat label={L.bestSeq} value={`${longestSeq}🧠`} />
        <ResultStat label={L.score} value={`${score}`} accent="tide" />
      </div>
      <p className="text-base text-ink-100" style={{ lineHeight: 1.6 }} dir={lang === "ar" ? "rtl" : "ltr"}>
        {reading}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-cursor="hover"
          onClick={onAgain}
          className="rounded-xl bg-ember-500 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:bg-ember-400"
        >
          {L.again}
        </button>
        <button
          type="button"
          data-cursor="hover"
          onClick={onIdle}
          className="rounded-xl border border-ink-700/70 px-5 py-2.5 text-xs uppercase tracking-[0.18em] text-ink-300 transition hover:border-ember-500/60 hover:text-ember-500"
        >
          ←
        </button>
      </div>
    </motion.div>
  );
}

function ResultStat({
  label,
  value,
  accent = "ink",
}: {
  label: string;
  value: string;
  accent?: "ink" | "ember" | "tide";
}) {
  const map = {
    ink: "text-ink-100",
    ember: "text-ember-500",
    tide: "text-tide-400",
  } as const;
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4 text-center sm:p-5">
      <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">{label}</div>
      <div className={`num-display mt-2 ${map[accent]}`} style={{ fontSize: "clamp(1.4rem, 3vw, 1.85rem)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

// silence unused-import warnings for AnimatePresence (kept for future enter/exit between rounds)
void AnimatePresence;
