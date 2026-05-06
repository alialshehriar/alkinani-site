// Tiny client for the /api/leaderboard endpoint pair.

export type LeaderboardEntry = {
  name: string;
  score: number;
  country?: string | null;
  createdAt: number;
  meta?: Record<string, unknown> | null;
};

export type RecentEntry = {
  name: string;
  score: number;
  country?: string | null;
  createdAt: number;
};

export type LiveStats = {
  players24h: number;
  runs24h: number;
  lastAt: number | null;
  recent: RecentEntry[];
};

export type LeaderboardResponse = {
  game: string;
  total: number;
  top: LeaderboardEntry[];
  live?: LiveStats;
};

export type SubmitResponse = {
  ok: true;
  game: string;
  name: string;
  score: number;
  rank: number;
  total: number;
  country?: string | null;
};

/** Convert ISO 3166 alpha-2 to flag emoji ("SA" -> "🇸🇦"). */
export function countryFlag(code?: string | null): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

export function relativeTime(ts: number, lang: "ar" | "en" = "ar"): string {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (lang === "ar") {
    if (sec < 60) return "الآن";
    if (min < 60) return `قبل ${min} دقيقة`;
    if (hr < 24) return `قبل ${hr} ساعة`;
    return `قبل ${Math.floor(hr / 24)} يوم`;
  }
  if (sec < 60) return "now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export type SubmitError = { error: string };

const NAME_KEY = "alk-leaderboard-name";

export function getStoredName(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}

export function storeName(name: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
}

export async function fetchLeaderboard(game: string, limit = 10, signal?: AbortSignal): Promise<LeaderboardResponse> {
  const res = await fetch(`/api/leaderboard?game=${encodeURIComponent(game)}&limit=${limit}`, { signal });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return res.json();
}

export async function submitScore(input: {
  game: string;
  name: string;
  score: number;
  meta?: Record<string, unknown>;
}): Promise<SubmitResponse> {
  const res = await fetch("/api/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as SubmitError).error || `submit ${res.status}`);
  return data as SubmitResponse;
}
