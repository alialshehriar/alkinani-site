import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../lib/i18n";
import {
  fetchRadar,
  formatVelocity,
  relTime,
  sourceEmoji,
  sourceGradient,
  sourceLabel,
  type RadarItem,
  type RadarStats,
} from "../lib/radar";

const PAGE_SIZE = 6;
const REFRESH_INTERVAL_MS = 30_000;
const JUST_IN_WINDOW_MS = 10 * 60_000;

const COPY = {
  ar: {
    eyebrow: "/ رادار الذكاء الاصطناعي",
    title: "نرصدها قبل ما تنتشر",
    sub: "محرك تنبؤي يلتقط أدوات ونماذج وأخبار الذكاء الاصطناعي من إكس وريديت وهاكر-نيوز وجيت-هب وبرودكت-هنت قبل أن تنتشر. نقيس تسارع التفاعل، لا الأعداد المطلقة.",
    all: "الكل",
    breaking: "🔥 ينتشر الآن",
    tools: "أدوات",
    papers: "بحوث",
    news: "أخبار",
    discussions: "نقاش",
    refresh: "تحديث",
    auto: "تحديث تلقائي",
    empty: "لا إشارات حالياً — جامِع الإشارات يعمل كل بضع دقائق.",
    loading: "نجمع الإشارات…",
    velocityLabel: "سرعة التفاعل",
    open: "افتح المصدر",
    sources: "المصادر",
    crossSource: (n: number) => `ظهرت في ${n} مصادر`,
    breakingPill: "صاعد",
    justIn: "وصلت الحين",
    live: "بثّ مباشر",
    nextIn: (s: number) => `التالي بـ${s}ث`,
    error: "تعذر التحميل — جرّب مرة ثانية",
    last: (s: string) => `آخر تحديث ${s}`,
    sinceLabel: (h: number) => `آخر ${h} ساعة`,
    page: (a: number, b: number) => `صفحة ${a} من ${b}`,
    prev: "السابق",
    next: "التالي",
    pageOf: (a: number, b: number, total: number) => `${a}–${b} من ${total}`,
  },
  en: {
    eyebrow: "/ AI Radar",
    title: "Catching it before it trends",
    sub: "Predictive engine surfacing AI tools, models and news from X / Reddit / HN / GitHub / Product Hunt before they trend. We track curve inflection — not absolute counts.",
    all: "All",
    breaking: "🔥 Breaking",
    tools: "Tools",
    papers: "Papers",
    news: "News",
    discussions: "Discuss",
    refresh: "Refresh",
    auto: "Auto-refresh",
    empty: "No signals yet — crawler runs every few minutes.",
    loading: "Pulling signals…",
    velocityLabel: "engagement velocity",
    open: "Open source",
    sources: "Sources",
    crossSource: (n: number) => `picked up by ${n} sources`,
    breakingPill: "inflection",
    justIn: "just in",
    live: "live",
    nextIn: (s: number) => `next in ${s}s`,
    error: "fetch failed — retry",
    last: (s: string) => `updated ${s}`,
    sinceLabel: (h: number) => `last ${h}h`,
    page: (a: number, b: number) => `page ${a} of ${b}`,
    prev: "Prev",
    next: "Next",
    pageOf: (a: number, b: number, total: number) => `${a}–${b} of ${total}`,
  },
} as const;

type Filter = "all" | "breaking" | "tool" | "news" | "discussion" | "paper";

const FILTERS: { id: Filter; key: keyof typeof COPY.ar }[] = [
  { id: "all",        key: "all" },
  { id: "breaking",   key: "breaking" },
  { id: "tool",       key: "tools" },
  { id: "news",       key: "news" },
  { id: "discussion", key: "discussions" },
];

const ease = [0.22, 1, 0.36, 1] as const;

type RadarCopy = typeof COPY.ar | typeof COPY.en;

export default function Radar({
  lang,
  embedded = false,
}: {
  lang: Lang;
  /** When true, drop the outer <section> + vertical padding so Radar can be
   *  nested inside another section (e.g. ToolsLab). The chapter anchor
   *  remains on the parent. */
  embedded?: boolean;
}) {
  const isAr = lang === "ar";
  const c = COPY[lang];
  const [items, setItems] = useState<RadarItem[]>([]);
  const [stats, setStats] = useState<RadarStats>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("*");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(0);
  const [auto, setAuto] = useState(true);
  const [page, setPage] = useState(0);
  const [secondsToNext, setSecondsToNext] = useState(REFRESH_INTERVAL_MS / 1000);
  const timer = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const r = await fetchRadar({ limit: 60, sinceHours: 24, signal });
      setItems(r.items);
      setStats(r.stats);
      setFetchedAt(r.fetchedAt);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    if (!auto) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    timer.current = window.setInterval(() => {
      load();
      setSecondsToNext(REFRESH_INTERVAL_MS / 1000);
    }, REFRESH_INTERVAL_MS);
    // 1Hz countdown — gives the user a visible signal that the radar is alive.
    setSecondsToNext(REFRESH_INTERVAL_MS / 1000);
    tickRef.current = window.setInterval(() => {
      setSecondsToNext((s) => (s <= 1 ? REFRESH_INTERVAL_MS / 1000 : s - 1));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [auto, load]);

  const filtered = useMemo(() => {
    let xs = items;
    if (sourceFilter !== "*") xs = xs.filter((it) => it.source === sourceFilter);
    if (filter === "breaking") xs = xs.filter((it) => it.breaking);
    else if (filter === "tool") xs = xs.filter((it) => it.category === "tool");
    else if (filter === "news") xs = xs.filter((it) => it.category === "news");
    else if (filter === "discussion") xs = xs.filter((it) => it.category === "discussion");
    else if (filter === "paper") xs = xs.filter((it) => it.category === "paper");
    return xs;
  }, [items, filter, sourceFilter]);

  // Reset to page 0 whenever filters change so user doesn't end up on an empty page.
  useEffect(() => { setPage(0); }, [filter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const breakingCount = items.filter((i) => i.breaking).length;
  const sourcesList = Object.keys(stats);
  const lastFetched = fetchedAt ? relTime(fetchedAt, lang) : "—";

  const Outer = embedded ? "div" : "section";
  const outerProps = embedded
    ? { className: "relative w-full" }
    : { id: "radar", className: "relative w-full px-5 py-28 sm:px-8 sm:py-36" };

  return (
    <Outer {...outerProps}>
      <div className={embedded ? "mx-auto max-w-6xl" : "mx-auto max-w-6xl"}>
        {/* Header */}
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6, ease }}
          className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12"
        >
          <div className="lg:col-span-4">
            <p className="text-xs uppercase tracking-[0.3em] text-ember-500">
              <span className="me-3 align-middle text-ink-600">/02</span>
              {c.eyebrow}
            </p>
            <h2 className="mt-5 text-3xl font-medium leading-tight text-ink-100 sm:text-4xl lg:text-5xl">
              {c.title}
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-300 sm:text-base">
              {c.sub}
            </p>

            {/* Source mini-stats */}
            {sourcesList.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                <button
                  onClick={() => setSourceFilter("*")}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    sourceFilter === "*"
                      ? "border-ember-500/60 bg-ember-500/10 text-ember-400"
                      : "border-ink-800 bg-ink-900/40 text-ink-400 hover:border-ink-700"
                  }`}
                >
                  {c.all} · {items.length}
                </button>
                {sourcesList.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSourceFilter(s === sourceFilter ? "*" : s)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      sourceFilter === s
                        ? "border-tide-500/60 bg-tide-500/10 text-tide-400"
                        : "border-ink-800 bg-ink-900/40 text-ink-400 hover:border-ink-700"
                    }`}
                  >
                    <span className="me-1">{sourceEmoji(s)}</span>
                    {sourceLabel(s, lang)} · {stats[s]?.count ?? 0}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-8">
            {/* Filter row */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => {
                const active = filter === f.id;
                const count = f.id === "breaking" ? breakingCount : null;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? f.id === "breaking"
                          ? "border-rose-500/60 bg-rose-500/15 text-rose-300"
                          : "border-ember-500/60 bg-ember-500/10 text-ember-400"
                        : "border-ink-800 bg-ink-900/40 text-ink-400 hover:border-ink-700 hover:text-ink-200"
                    }`}
                  >
                    {c[f.key as keyof typeof c] as string}
                    {count !== null && count > 0 && (
                      <span className="ms-1.5 inline-block min-w-[1.25rem] rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[0.6rem] text-rose-300">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="ms-auto flex items-center gap-2 text-xs text-ink-500">
                <button
                  onClick={() => { setLoading(true); load(); }}
                  className="rounded-full border border-ink-800 bg-ink-900/40 px-3 py-1.5 text-ink-400 transition hover:border-ink-700 hover:text-ink-200"
                  aria-label={c.refresh}
                >
                  {loading ? "…" : "↻"} {c.refresh}
                </button>
                <label className="flex select-none items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                    className="h-3 w-3 accent-ember-500"
                  />
                  <span>{c.auto}</span>
                </label>
              </div>
            </div>

            {/* Status line — live pulse + countdown to next refresh */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-ink-500">
              <span className="flex items-center gap-1.5">
                <span className="relative inline-flex h-2 w-2" aria-hidden>
                  <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 ${auto ? "motion-safe:animate-ping" : ""}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${auto ? "bg-emerald-400" : "bg-ink-700"}`} />
                </span>
                <span className="font-medium uppercase tracking-[0.2em] text-emerald-300">{c.live}</span>
                <span className="text-ink-600">·</span>
                <span>{c.last(lastFetched)}</span>
                {auto && (
                  <>
                    <span className="text-ink-600">·</span>
                    <span className="num-display tabular-nums text-ink-400">{c.nextIn(Math.max(0, secondsToNext))}</span>
                  </>
                )}
              </span>
              <span>{c.sinceLabel(24)}</span>
            </div>

            {/* Cards grid */}
            {error && (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
                {c.error} — {error}
              </div>
            )}
            {loading && filtered.length === 0 ? (
              <div className="rounded-2xl border border-ink-800/60 bg-ink-900/30 p-10 text-center text-sm text-ink-400">
                {c.loading}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-ink-800/60 bg-ink-900/30 p-10 text-center text-sm text-ink-400">
                {c.empty}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <AnimatePresence mode="popLayout">
                    {pageItems.map((it) => (
                      <RadarCard key={it.id} item={it} lang={lang} isAr={isAr} c={c} />
                    ))}
                  </AnimatePresence>
                </div>

                {totalPages > 1 && (
                  <RadarPagination
                    page={safePage}
                    totalPages={totalPages}
                    onPage={setPage}
                    countText={c.pageOf(pageStart + 1, Math.min(pageStart + PAGE_SIZE, filtered.length), filtered.length)}
                    prevLabel={c.prev}
                    nextLabel={c.next}
                    isAr={isAr}
                  />
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </Outer>
  );
}

function RadarCard({
  item,
  lang,
  isAr,
  c,
}: {
  item: RadarItem;
  lang: Lang;
  isAr: boolean;
  c: RadarCopy;
}) {
  const grad = sourceGradient(item.source);
  const showThumb = !!item.thumbnail && /^https?:\/\//.test(item.thumbnail);
  // "Just in" — items first seen by the radar in the last JUST_IN_WINDOW_MS
  // get a fresh-arrival badge so visitors immediately see the radar is alive.
  const justIn = !!item.firstSeen && Date.now() - item.firstSeen < JUST_IN_WINDOW_MS;
  // Hover tooltip text picker — prefer judge verdict (sharpest single-line
  // explanation), then summaryAr (Najdi explanation), then excerpt fallbacks.
  const summaryText =
    item.judge?.verdict ||
    (isAr && item.summaryAr) ||
    (isAr && item.excerptAr) ||
    item.excerpt ||
    null;
  const hasSummary = !!summaryText && summaryText !== item.title && summaryText !== item.titleAr;
  // Show 3-axis judge breakdown in tooltip if available.
  const judgeBreakdown = item.judge
    ? `${isAr ? "جدّة" : "novelty"} ${item.judge.novelty}/10 · ${isAr ? "أثر" : "impact"} ${item.judge.impact}/10 · ${isAr ? "إشارة" : "signal"} ${item.judge.signal}/10`
    : null;
  return (
    <motion.a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease }}
      whileHover={{ y: -3 }}
      className={`group relative block overflow-visible rounded-2xl border border-ink-800/70 bg-gradient-to-br ${grad} bg-ink-900/40 p-4 transition hover:border-ember-500/40 hover:shadow-[0_8px_30px_-10px_rgba(255,140,60,0.25)]`}
    >
      {/* Breaking pill */}
      {item.breaking && (
        <div className="absolute end-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-rose-500/60 bg-rose-500/15 px-2 py-0.5 text-[0.65rem] font-medium text-rose-300 backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-400" />
          </span>
          {c.breakingPill}
        </div>
      )}

      <div className="flex gap-3">
        {showThumb && (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-ink-800">
            <img
              src={item.thumbnail!}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-wider">
            <span className="font-medium text-ink-300">
              {sourceEmoji(item.source)} {sourceLabel(item.source, lang)}
            </span>
            {item.author && <span className="truncate text-ink-500">· {item.author}</span>}
            <span className="text-ink-600">· {relTime(item.postedAt || item.firstSeen, lang)}</span>
            {justIn && (
              <span className="ms-1 inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-400/10 px-1.5 py-0.5 text-[0.55rem] font-semibold normal-case tracking-normal text-emerald-300">
                <span className="relative inline-flex h-1 w-1" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1 w-1 rounded-full bg-emerald-400" />
                </span>
                {c.justIn}
              </span>
            )}
          </div>

          {/* Title — Arabic first if translated, original below as subtitle. */}
          {isAr && item.titleAr ? (
            <>
              <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink-100 group-hover:text-ember-400" dir="rtl">
                {item.titleAr}
              </h3>
              <p className="mt-1 line-clamp-1 text-[0.65rem] text-ink-600" dir="ltr" lang="en">
                {item.title}
              </p>
            </>
          ) : (
            <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink-100 group-hover:text-ember-400" dir={isAr ? "rtl" : "ltr"}>
              {item.title}
            </h3>
          )}

          {/* Velocity + cross-source + judge score pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem]">
            {item.velocity > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-ember-500/30 bg-ember-500/10 px-2 py-0.5 text-ember-400">
                <span aria-hidden>↗</span>
                {formatVelocity(item.velocity, lang)}
              </span>
            )}
            {item.crossSource > 1 && (
              <span className="rounded-full border border-tide-500/30 bg-tide-500/10 px-2 py-0.5 text-tide-400">
                ×{item.crossSource} {isAr ? "مصادر" : "sources"}
              </span>
            )}
            {item.judge && (
              <span
                className={`rounded-full border px-2 py-0.5 ${
                  item.judge.score >= 8
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : item.judge.score >= 6
                    ? "border-tide-500/30 bg-tide-500/10 text-tide-300"
                    : "border-ink-700 bg-ink-900/40 text-ink-400"
                }`}
                title={item.judge.verdict}
              >
                {isAr ? "🎯" : "🎯"} {item.judge.score.toFixed(1)}
              </span>
            )}
            {(item.meta as { stars?: number; starsPerDay?: number } | null)?.stars !== undefined && (
              <span className="text-ink-500">★ {(item.meta as { stars: number }).stars.toLocaleString()}</span>
            )}
            {(item.meta as { score?: number; comments?: number; ups?: number } | null)?.ups !== undefined && (
              <span className="text-ink-500">▲ {(item.meta as { ups: number }).ups.toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Hover-revealed verdict tooltip — judge's call (or translation fallback). */}
      {hasSummary && (
        <div
          className="pointer-events-none absolute inset-x-3 bottom-full z-30 mb-2 origin-bottom translate-y-2 scale-95 rounded-xl border border-ember-500/40 bg-ink-950/95 px-3.5 py-2.5 opacity-0 shadow-2xl shadow-black/60 backdrop-blur transition-all duration-200 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100"
          dir={isAr ? "rtl" : "ltr"}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-[0.6rem] uppercase tracking-wider">
            <span className="text-ember-400">
              <span aria-hidden>›</span>{" "}
              {item.judge ? (isAr ? "تقييم القاضي" : "judge verdict") : (isAr ? "ملخص سريع" : "quick summary")}
            </span>
            {item.judge && (
              <span className={`rounded-full px-1.5 py-0.5 ${
                item.judge.score >= 8 ? "bg-emerald-500/20 text-emerald-300"
                : item.judge.score >= 6 ? "bg-tide-500/20 text-tide-300"
                : "bg-ink-800 text-ink-400"
              }`}>
                {item.judge.score.toFixed(1)}/10
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-ink-100 line-clamp-4">
            {summaryText}
          </p>
          {judgeBreakdown && (
            <p className="mt-1.5 text-[0.6rem] text-ink-500">{judgeBreakdown}</p>
          )}
          <span
            aria-hidden
            className="absolute -bottom-1.5 start-6 h-3 w-3 rotate-45 border-b border-e border-ember-500/40 bg-ink-950/95"
          />
        </div>
      )}
    </motion.a>
  );
}

function RadarPagination({
  page,
  totalPages,
  onPage,
  countText,
  prevLabel,
  nextLabel,
  isAr,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  countText: string;
  prevLabel: string;
  nextLabel: string;
  isAr: boolean;
}) {
  // Build a compact page number list (max ~7 visible) with ellipses for big totals.
  const pages: (number | "ellipsis")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 3) pages.push("ellipsis");
    const lo = Math.max(1, page - 1);
    const hi = Math.min(totalPages - 2, page + 1);
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (page < totalPages - 4) pages.push("ellipsis");
    pages.push(totalPages - 1);
  }

  // RTL-aware arrows: in Arabic the visual "previous" still goes right.
  const arrowPrev = isAr ? "›" : "‹";
  const arrowNext = isAr ? "‹" : "›";

  return (
    <nav
      className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800/60 pt-4"
      aria-label="Radar pagination"
    >
      <span className="text-[0.7rem] text-ink-500">{countText}</span>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="rounded-full border border-ink-800 bg-ink-900/40 px-3 py-1.5 text-xs text-ink-300 transition hover:border-ember-500/50 hover:text-ember-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ink-800 disabled:hover:text-ink-300"
          aria-label={prevLabel}
        >
          <span className="me-1" aria-hidden>{arrowPrev}</span>
          {prevLabel}
        </button>

        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e${i}`} className="px-2 text-xs text-ink-600" aria-hidden>…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={`min-w-[2rem] rounded-full px-2 py-1 text-xs transition ${
                  p === page
                    ? "border border-ember-500/60 bg-ember-500/15 text-ember-300"
                    : "border border-transparent text-ink-400 hover:border-ink-700 hover:text-ink-100"
                }`}
              >
                {p + 1}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="rounded-full border border-ink-800 bg-ink-900/40 px-3 py-1.5 text-xs text-ink-300 transition hover:border-ember-500/50 hover:text-ember-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ink-800 disabled:hover:text-ink-300"
          aria-label={nextLabel}
        >
          {nextLabel}
          <span className="ms-1" aria-hidden>{arrowNext}</span>
        </button>
      </div>
    </nav>
  );
}
