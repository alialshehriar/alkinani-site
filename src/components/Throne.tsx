import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import {
  countryFlag,
  fetchKing,
  type KingEntry,
} from "../lib/leaderboard";

const COPY = {
  ar: {
    eyebrow: "/ صدارة الأبطال",
    title: "بطل التحدّي الثلاثي",
    sub: "اجمع نقاطك من الألعاب الثلاث: Tech Sprint + Pulse + Reflex Lab. صاحب أعلى مجموع يقعد على العرش — لين يطيحه غيره.",
    throneEmpty: "العرش فاضٍ. أول واحد يكمل الألعاب الثلاث يحتله.",
    challenger: (n: string) => `تحدّى ${n}`,
    crown: "👑",
    rank: "المركز",
    total: "المجموع",
    games: "الألعاب",
    name: "الاسم",
    sprint: "سرعة",
    pulse: "ذاكرة",
    reflex: "قرارات",
    of3: "من ٣",
    moreToGo: "اكمل الألعاب الباقية",
    fullTrio: "كملت الثلاث 🔥",
    refresh: "تحديث",
    cta: "العب الثلاث واقعد على العرش",
    footer: (n: number) => `${n} لاعب يتنافسون`,
  },
  en: {
    eyebrow: "/ leaderboard",
    title: "Triple-Challenge Champion",
    sub: "Add up your scores from the three games: Tech Sprint + Pulse + Reflex Lab. Highest combined score holds the throne — until someone topples them.",
    throneEmpty: "Throne is empty. First to complete all three takes it.",
    challenger: (n: string) => `Challenge ${n}`,
    crown: "👑",
    rank: "Rank",
    total: "Total",
    games: "Games",
    name: "Name",
    sprint: "speed",
    pulse: "memory",
    reflex: "decisions",
    of3: "of 3",
    moreToGo: "complete remaining games",
    fullTrio: "all three done 🔥",
    refresh: "Refresh",
    cta: "Play all three to take the throne",
    footer: (n: number) => `${n} players competing`,
  },
} as const;

function fmt(n: number) {
  return new Intl.NumberFormat(undefined).format(Math.max(0, n));
}

export default function Throne({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  const L = COPY[lang];
  const [top, setTop] = useState<KingEntry[]>([]);
  const [uniqueNames, setUniqueNames] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const data = await fetchKing(10, ac.signal);
      setTop(data.top);
      setUniqueNames(data.uniqueNames);
    } catch { /* keep last good */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const king = top[0] || null;
  const rest = top.slice(1, 5);

  const goPlay = () => {
    const lab = document.getElementById("lab");
    if (lab) lab.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section
      id="throne"
      className="relative w-full overflow-hidden px-4 py-16 sm:px-8 sm:py-24"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="ambient-orb pulse-soft pointer-events-none"
        style={{
          width: 480,
          height: 480,
          top: "10%",
          [isAr ? "left" : "right"]: -160,
          background: "oklch(0.78 0.16 60 / 0.85)",
        }}
      />

      <div className="relative mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-3 sm:gap-6 lg:grid-cols-12 lg:items-baseline">
          <p className="text-[10px] uppercase tracking-[0.3em] text-ember-500 lg:col-span-4">
            {L.eyebrow}
          </p>
          <h2
            className="font-semibold leading-[1.1] text-ink-100 lg:col-span-8"
            style={{ fontSize: "clamp(1.7rem, 4.5vw, 3.2rem)" }}
          >
            {L.title}
          </h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink-400 sm:text-base" style={{ lineHeight: 1.65 }}>
          {L.sub}
        </p>

        {/* Throne card */}
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* The King */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {king ? (
                <motion.div
                  key={king.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5 }}
                  className="relative overflow-hidden rounded-3xl border border-ember-500/40 bg-gradient-to-br from-ember-500/15 via-ink-950/80 to-tide-500/10 p-6 sm:p-8"
                >
                  {/* Crown badge */}
                  <div className="absolute end-4 top-4 text-3xl sm:text-4xl">{L.crown}</div>

                  <div className="text-[10px] uppercase tracking-[0.3em] text-ember-500">
                    #1 {L.rank}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-2xl sm:text-3xl">
                    {king.country && (
                      <span aria-label={king.country} className="text-3xl">
                        {countryFlag(king.country)}
                      </span>
                    )}
                    <span className="font-semibold text-ink-100">{king.name}</span>
                  </div>

                  <div
                    className="num-display mt-4 text-ink-100"
                    style={{ fontSize: "clamp(2.6rem, 8vw, 4.5rem)", letterSpacing: "-0.03em", lineHeight: 1 }}
                  >
                    {fmt(king.total)}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-ink-400">
                    {L.total} ·{" "}
                    <span className={king.gamesPlayed === 3 ? "text-emerald-300" : "text-ember-400"}>
                      {king.gamesPlayed === 3 ? L.fullTrio : `${king.gamesPlayed}/${3}`}
                    </span>
                  </div>

                  {/* Per-game breakdown */}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <BreakdownPill label={L.sprint} value={king.breakdown.sprint} accent="tide" />
                    <BreakdownPill label={L.pulse} value={king.breakdown.pulse} accent="emerald" />
                    <BreakdownPill label={L.reflex} value={king.breakdown.reflex} accent="ember" />
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={goPlay}
                      className="rounded-xl bg-gradient-to-br from-ember-500 to-tide-500 px-5 py-3 text-sm font-medium uppercase tracking-[0.18em] text-ink-950 transition active:scale-95 hover:brightness-110"
                    >
                      {L.challenger(king.name)}
                    </button>
                    <span className="text-[11px] text-ink-500">
                      {L.footer(uniqueNames)}
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-3xl border border-ink-800 bg-ink-900/50 p-8 text-center"
                >
                  <div className="text-6xl opacity-40">{L.crown}</div>
                  <p className="mt-4 text-sm text-ink-400">{L.throneEmpty}</p>
                  <button
                    type="button"
                    onClick={goPlay}
                    className="mt-5 rounded-xl bg-gradient-to-br from-ember-500 to-tide-500 px-5 py-3 text-sm font-medium uppercase tracking-[0.18em] text-ink-950 active:scale-95"
                  >
                    {L.cta}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Top 2-5 list */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-ink-800 bg-ink-900/40 p-3 sm:p-4">
              <div className="flex items-baseline justify-between px-2">
                <span className="text-[9px] uppercase tracking-[0.22em] text-ink-500">
                  Top 2-5
                </span>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                  className="text-[10px] text-ink-500 transition hover:text-ink-200 disabled:opacity-40"
                  aria-label={L.refresh}
                >
                  {loading ? "…" : "↻"}
                </button>
              </div>
              {rest.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-ink-500">—</div>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {rest.map((r, i) => (
                    <motion.li
                      key={r.name}
                      initial={{ opacity: 0, x: isAr ? 6 : -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between gap-2 rounded-xl bg-ink-950/40 px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-[10px] text-ink-500">#{i + 2}</span>
                        {r.country && <span>{countryFlag(r.country)}</span>}
                        <span className="truncate text-sm text-ink-200">{r.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="num-display text-sm text-ink-100">{fmt(r.total)}</span>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em]",
                            r.gamesPlayed === 3
                              ? "bg-emerald-400/15 text-emerald-300"
                              : "bg-ember-500/15 text-ember-300",
                          ].join(" ")}
                        >
                          {r.gamesPlayed}/3
                        </span>
                      </span>
                    </motion.li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BreakdownPill({
  label,
  value,
  accent = "ink",
}: {
  label: string;
  value: number;
  accent?: "ink" | "ember" | "tide" | "emerald";
}) {
  const map = {
    ink: "text-ink-100 border-ink-800",
    ember: "text-ember-400 border-ember-500/30",
    tide: "text-tide-300 border-tide-500/30",
    emerald: "text-emerald-300 border-emerald-400/30",
  } as const;
  return (
    <div className={`rounded-xl border bg-ink-950/40 px-3 py-2 text-center ${map[accent]}`}>
      <div className="text-[9px] uppercase tracking-[0.22em] text-ink-500">{label}</div>
      <div className="num-display mt-1 text-base sm:text-lg">{value || "—"}</div>
    </div>
  );
}
