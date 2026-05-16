import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import {
  countryFlag,
  fetchLeaderboard,
  getStoredName,
  relativeTime,
  storeName,
  submitScore,
  type LeaderboardEntry,
  type LiveStats,
  type RecentEntry,
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
    refresh: "تحديث",
    livePlayers: "لاعب نشط",
    liveRuns: "محاولة",
    last24h: "آخر 24 ساعة",
    activity: "آخر النتائج",
    shareTitle: "شارك نتيجتك",
    shareText: (score: number, rank: number) =>
      `سجلت ${score} نقطة في تحدّي السرعة على alkinani.live — المركز #${rank} 🔥\nتحدّاني:`,
    shareBtn: "نشر على X",
    copyLink: "انسخ الرابط",
    copied: "تم النسخ!",
  },
  en: {
    title: "Global Leaderboard",
    subtitle: "Challenge your friends. Beat the record and join the champions list.",
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
    refresh: "Refresh",
    livePlayers: "active players",
    liveRuns: "runs",
    last24h: "last 24h",
    activity: "Recent runs",
    shareTitle: "Share your score",
    shareText: (score: number, rank: number) =>
      `Just scored ${score} on the speed challenge at alkinani.live — rank #${rank} 🔥\nbeat me:`,
    shareBtn: "Share on X",
    copyLink: "Copy link",
    copied: "Copied!",
  },
} as const;

const SHARE_URL = "https://alkinani.live/#lab";

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
  const [live, setLive] = useState<LiveStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(() => getStoredName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ rank: number; total: number; score: number } | null>(null);
  const [highlightName, setHighlightName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const data = await fetchLeaderboard(game, showLimit, ac.signal);
      setTop(data.top);
      setLive(data.live || null);
      setTotal(data.total);
    } catch {
      /* keep last good state on transient error */
    } finally {
      setLoading(false);
    }
  }, [game, showLimit]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh live activity every 30s while mounted (cheap — 10s server cache).
  useEffect(() => {
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Reset submit state whenever a new pending score arrives.
  useEffect(() => {
    setSubmitted(null);
    setError(null);
    setHighlightName(null);
    setCopied(false);
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
      setSubmitted({ rank: r.rank, total: r.total, score: r.score });
      setHighlightName(trimmed);
      onSubmitted?.(r.rank, r.total);
      // Haptic feedback on supported mobile devices.
      try {
        const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
        // Bigger pattern for top-3 finishes.
        nav.vibrate?.(r.rank <= 3 ? [80, 50, 80, 50, 120] : 30);
      } catch { /* not supported */ }
      window.setTimeout(refresh, 250);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const handleShare = () => {
    if (!submitted) return;
    const text = L.shareText(submitted.score, submitted.rank);
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + "\n" + SHARE_URL)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    if (!submitted) return;
    const text = L.shareText(submitted.score, submitted.rank) + "\n" + SHARE_URL;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  const showForm = !!pendingScore && !submitted;

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-4 sm:p-6" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
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

      {/* Live stats strip */}
      {live && (live.players24h > 0 || live.runs24h > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-ink-800/60 bg-ink-950/40 px-3 py-2 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="num-display text-emerald-300">{live.players24h}</span>
            <span className="text-ink-500">{L.livePlayers}</span>
          </span>
          <span className="text-ink-700">·</span>
          <span>
            <span className="num-display text-ink-200">{live.runs24h}</span>{" "}
            <span className="text-ink-500">{L.liveRuns}</span>
          </span>
          <span className="text-ink-700 hidden sm:inline">·</span>
          <span className="hidden text-ink-500 sm:inline">{L.last24h}</span>
        </div>
      )}

      {/* Submit form */}
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

      {/* Submitted confirmation + share */}
      <AnimatePresence>
        {submitted && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/10 to-tide-500/10 p-4"
          >
            <div className="text-xs text-emerald-200 sm:text-sm">
              {L.submitted}{" "}
              <strong className="num-display text-emerald-300">
                {L.rankPrefix}{submitted.rank}
              </strong>{" "}
              <span className="text-ink-400">{L.of} {submitted.total}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-lg bg-ink-100 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-950 transition hover:bg-white"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
                  <path d="M18.244 2H21l-6.52 7.45L22 22h-6.79l-4.95-6.46L4.6 22H1.84l6.97-7.96L1 2h6.93l4.49 5.93L18.24 2zm-1.18 18h1.74L7.05 4H5.2l11.86 16z" />
                </svg>
                {L.shareBtn}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-300 transition hover:border-ink-500"
              >
                {copied ? L.copied : L.copyLink}
              </button>
            </div>
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
            const flag = countryFlag(row.country);
            return (
              <motion.li
                key={`${row.name}-${row.score}-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                style={{ minHeight: 44 }}
                className={[
                  "grid grid-cols-[2.4rem_1fr_auto] items-center gap-3 border-b border-ink-800/60 px-3 py-3 text-sm last:border-b-0 sm:py-2",
                  isYou ? "bg-ember-500/10" : "",
                ].join(" ")}
              >
                <div className="text-center text-[11px] text-ink-500">
                  {medal || `#${rank}`}
                </div>
                <div className={`min-w-0 ${isYou ? "font-medium text-ember-400" : "text-ink-200"}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {flag && <span aria-label={row.country || ""} className="text-base">{flag}</span>}
                    <span className="truncate">{row.name}</span>
                  </span>
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

      {/* Live activity ticker */}
      {variant === "full" && live && live.recent.length > 0 && (
        <div className="mt-4 rounded-xl border border-ink-800/60 bg-ink-950/30 p-3">
          <div className="text-[9px] uppercase tracking-[0.22em] text-ink-500">
            {L.activity}
          </div>
          <ol className="mt-2 space-y-1.5 text-xs">
            {live.recent.map((r: RecentEntry, i) => {
              const flag = countryFlag(r.country);
              return (
                <motion.li
                  key={`${r.name}-${r.createdAt}-${i}`}
                  initial={{ opacity: 0, x: isAr ? 6 : -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between gap-3 text-ink-400"
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    {flag && <span className="text-sm">{flag}</span>}
                    <span className="truncate text-ink-200">{r.name}</span>
                    <span className="num-display text-ember-400">+{fmtScore(r.score)}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-500">
                    {relativeTime(r.createdAt, lang)}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
