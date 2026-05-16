// AI Radar client — fetches /api/radar.

export type RadarMeta = Record<string, unknown> | null;

export type RadarJudgment = {
  novelty: number;   // 1-10
  impact: number;    // 1-10
  signal: number;    // 1-10
  score: number;     // composite 1-10
  verdict: string;   // brief Najdi reasoning
  at: number;
};

export type RadarItem = {
  id: number;
  source: "x" | "reddit" | "hackernews" | "github" | "producthunt" | "huggingface" | string;
  externalId: string;
  url: string;
  title: string;
  titleAr?: string | null;
  author?: string | null;
  thumbnail?: string | null;
  excerpt?: string | null;
  excerptAr?: string | null;
  summaryAr?: string | null;
  category?: string | null;
  langDetected?: string | null;
  engagement: number;
  velocity: number;
  authority: number;
  crossSource: number;
  score: number;
  breaking: boolean;
  translated?: boolean;
  judge?: RadarJudgment | null;
  meta: RadarMeta;
  postedAt?: number | null;
  firstSeen: number;
  lastUpdated: number;
};

export type RadarStats = Record<string, { count: number; lastAt: number }>;

export type RadarResponse = {
  items: RadarItem[];
  stats: RadarStats;
  sinceHours: number;
  fetchedAt: number;
};

const SOURCE_LABELS: Record<string, { ar: string; en: string; emoji: string; color: string }> = {
  x:           { ar: "إكس",        en: "X",          emoji: "𝕏",  color: "from-zinc-500/20 to-zinc-700/10" },
  reddit:      { ar: "ريديت",      en: "Reddit",     emoji: "🔶", color: "from-orange-500/20 to-amber-700/10" },
  hackernews:  { ar: "هاكر-نيوز",  en: "HN",         emoji: "🟧", color: "from-orange-600/20 to-red-700/10" },
  github:      { ar: "جيت-هب",     en: "GitHub",     emoji: "⬡",  color: "from-violet-500/20 to-fuchsia-700/10" },
  producthunt: { ar: "برودكت-هنت", en: "PH",         emoji: "🔺", color: "from-rose-500/20 to-pink-700/10" },
  huggingface: { ar: "هاجنق-فيس",  en: "HF",         emoji: "🤗", color: "from-yellow-400/20 to-amber-600/10" },
};

export function sourceLabel(source: string, lang: "ar" | "en"): string {
  const s = SOURCE_LABELS[source];
  if (!s) return source;
  return s[lang];
}

export function sourceEmoji(source: string): string {
  return SOURCE_LABELS[source]?.emoji || "•";
}

export function sourceGradient(source: string): string {
  return SOURCE_LABELS[source]?.color || "from-amber-500/15 to-orange-700/10";
}

export function relTime(ts: number, lang: "ar" | "en" = "ar"): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (lang === "ar") {
    if (min < 1) return "الآن";
    if (min < 60) return `قبل ${min} د`;
    if (hr < 24) return `قبل ${hr} س`;
    return `قبل ${day} يوم`;
  }
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (hr < 24) return `${hr}h`;
  return `${day}d`;
}

export async function fetchRadar(opts: {
  source?: string;
  category?: string;
  limit?: number;
  sinceHours?: number;
  signal?: AbortSignal;
} = {}): Promise<RadarResponse> {
  const params = new URLSearchParams();
  if (opts.source && opts.source !== "*") params.set("source", opts.source);
  if (opts.category && opts.category !== "*") params.set("category", opts.category);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.sinceHours) params.set("sinceHours", String(opts.sinceHours));
  const r = await fetch(`/api/radar?${params}`, { signal: opts.signal });
  if (!r.ok) throw new Error(`radar: HTTP ${r.status}`);
  return r.json();
}

export async function fetchBreaking(limit = 8, signal?: AbortSignal): Promise<{ items: RadarItem[] }> {
  const r = await fetch(`/api/radar/breaking?limit=${limit}`, { signal });
  if (!r.ok) throw new Error(`radar-breaking: HTTP ${r.status}`);
  return r.json();
}

/** Format a velocity (engagement units / minute) as a human-readable rate. */
export function formatVelocity(v: number, lang: "ar" | "en" = "ar"): string {
  if (!isFinite(v) || v <= 0) return lang === "ar" ? "–" : "–";
  const perHour = v * 60;
  if (perHour < 10) return lang === "ar" ? `${perHour.toFixed(1)}/س` : `${perHour.toFixed(1)}/h`;
  if (perHour < 1000) return lang === "ar" ? `${Math.round(perHour)}/س` : `${Math.round(perHour)}/h`;
  return lang === "ar" ? `${(perHour / 1000).toFixed(1)}ك/س` : `${(perHour / 1000).toFixed(1)}k/h`;
}
