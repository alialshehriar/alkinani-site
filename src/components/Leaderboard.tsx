import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import {
  fetchLeaderboard,
  getStoredName,
  storeName,
  submitScore,
  type LeaderboardEntry,
} from "../lib/leaderboard";

type Props = {
  lang: Lang;
  game: string;
  /** When non-null, shows the submit form for this finished run. */
  pendingScore?: { score: number; meta?: Record<string, unknown> } | null;
  /** Notifies parent after a successful submit so it can update local state. */
  onSubmitted?: (rank: number, total: number) => void;
  /** How many top entries to show. Default 5 in compact, 10 in full. */
  limit?: number;
  /** "compact" = inline before the game; "full" = post-result expanded. */
  variant?: "compact" | "full";
};

const COPY = {
  ar: {
    title: "لوحة الصدارة العالمية",
    subtitle: "تحدّى أصحابك. اللي يكسر الرقم القياسي ينضاف لقائمة الأبطال.",
    empty: "ما حد سجل بعد. كن أول واحد.",
    nameLabel: "اسمك أو لقبك (يظهر للعالم)",
    namePlaceholder: "مثال: أبو سعيد",
    submit: "ثبّت اسمي في القائمة",
    submitting: "جارٍ الحفظ...",
    submitted: "تم! ترتيبك:",
    of: "من",
    you: "أنت",
    rank: "المركز",
    score: "النقاط",
    name: "الاسم",
    rankPrefix: "#",
    error: "خطأ:",
    tryAgain: "حاول مرة ثانية",
    refresh: "تحديث",
  },
  en: {
    title: "Global Leaderboard",
    subtitle: "Challenge your friends. Beat the high score and join the list of champions.",
    empty: "Nobody yet. Be the first.",
    nameLabel: "Your name or handle (shown publicly)",
    namePlaceholder: "e.g., Abu Saeed",
    submit: "Lock my name in",
    submitting: "Saving...",
    submitted: "Done! Your rank:",
    of: "of",
    you: "you",
    rank: "Rank",
    score: "Score",
    name: "Name",
    rankPrefix: "#",
    error: "Error:",
    tryAgain: "Try again",
    refresh: "Refresh",
  },
} as const;

function fmtScore(n: number) {
  return new Intl.NumberFormat(undefined).format(Math.max(0, n));
}

export default function Leaderboard({
  lang,
  game,
  pendingScore = null,
  onSubmitted,
  limit,
  variant = "compact",
}: Props) {
  const isAr = lang === "ar";
  const L = COPY[lang];
  const showLimit = limit ?? (variant === "full" ? 10 : 5);

  const [top, setTop] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(() => getStoredName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ rank: number; total: number } | null>(null);
  const [highlightName, setHighlightName] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const data = await fetchLeaderboard(game, showLimit, ac.signal);
      setTop(data.top);
      setTotal(data.total);
    } catch {
      /* keep last good state on transient error */
    } finally {
      setLoading(false);
    }
  }, [game, showLimit]);

  useEffect(() => { refresh(); }, [refresh]);

  // Reset submit state whenever a new pending score arrives.
  useEffect(() => {
    setSubmitted(null);
    setError(null);
    setHighlightName(null);
  }, [pendingScore?.score]);

  const onSubmit = async () => {
    if (!pendingScore) return;
    setError(null);
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) {
      setError(isAr ? "اكتب اسم قبل ما تسجل." : "Enter a name first.");
      return;
    }
    setBusy(true);
    try {
      const r = await submitScore({
        game,
        name: trimmed,
        score: Math.max(0, Math.floor(pendingScore.score)),
        meta: pendingScore.meta,
      });
      storeName(trimmed);
      setSubmitted({ rank: r.rank, total: r.total });
      setHighlightName(trimmed);
      onSubmitted?.(r.rank, r.total);
      // Refresh shortly after so the new entry appears.
      window.setTimeout(refresh, 250);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const showForm = !!pendingScore && !submitted;

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-4 sm:p-6" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-ember-500">
            {L.title}
          </div>
          <p className="mt-1 text-xs text-ink-400 sm:text-sm" style={{ lineHeight: 1.55 }}>
            {L.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-[10px] uppercase tracking-[0.18em] text-ink-500 transition hover:text-ink-200 disabled:opacity-40"
          aria-label={L.refresh}
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* Submit form (only shown when there's a pending score) */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            key="submit-form"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
            className="mt-4 rounded-xl border border-ember-500/30 bg-ember-500/5 p-3 sm:p-4"
          >
            <label htmlFor="lb-name" className="text-[10px] uppercase tracking-[0.2em] text-ember-500">
              {L.nameLabel}
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="lb-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={L.namePlaceholder}
                maxLength={30}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:border-ember-500"
                dir={isAr ? "rtl" : "ltr"}
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-gradient-to-br from-ember-500 to-tide-500 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {busy ? L.submitting : L.submit}
              </button>
            </div>
            {error && (
              <div className="mt-2 text-[11px] text-red-300">
                {L.error} {error}
              </div>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      {/* Confirmation */}
      <AnimatePresence>
        {submitted && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200 sm:text-sm"
          >
            {L.submitted}{" "}
            <strong className="num-display text-emerald-300">
              {L.rankPrefix}{submitted.rank}
            </strong>{" "}
            {L.of} {submitted.total}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top list */}
      <div className="mt-4 overflow-hidden rounded-xl border border-ink-800">
        <div className="grid grid-cols-[2.2rem_1fr_auto] gap-3 border-b border-ink-800 bg-ink-950/60 px-3 py-2 text-[9px] uppercase tracking-[0.22em] text-ink-500">
          <div className="text-center">#</div>
          <div>{L.name}</div>
          <div className="text-end">{L.score}</div>
        </div>
        {top.length === 0 && !loading && (
          <div className="px-3 py-6 text-center text-xs text-ink-500">
            {L.empty}
          </div>
        )}
        <ol>
          {top.map((row, i) => {
            const isYou = highlightName && row.name === highlightName;
            const rank = i + 1;
            const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
            return (
              <motion.li
                key={`${row.name}-${row.score}-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className={[
                  "grid grid-cols-[2.2rem_1fr_auto] items-center gap-3 border-b border-ink-800/60 px-3 py-2 text-sm last:border-b-0",
                  isYou ? "bg-ember-500/10" : "",
                ].join(" ")}
              >
                <div className="text-center text-[11px] text-ink-500">
                  {medal || `#${rank}`}
                </div>
                <div className={isYou ? "font-medium text-ember-400" : "text-ink-200"}>
                  <span className="truncate">{row.name}</span>
                  {isYou && (
                    <span className="ms-2 rounded-full bg-ember-500/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-ember-300">
                      {L.you}
                    </span>
                  )}
                </div>
                <div className={`num-display text-end ${isYou ? "text-ember-400" : "text-ink-100"}`}>
                  {fmtScore(row.score)}
                </div>
              </motion.li>
            );
          })}
        </ol>
      </div>

      {total > showLimit && (
        <div className="mt-2 text-end text-[10px] text-ink-500">
          {total} {isAr ? "محاولة مسجّلة" : "runs recorded"}
        </div>
      )}
    </div>
  );
}
