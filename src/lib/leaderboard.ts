// Tiny client for the /api/leaderboard endpoint pair.

export type LeaderboardEntry = {
  name: string;
  score: number;
  createdAt: number;
  meta?: Record<string, unknown> | null;
};

export type LeaderboardResponse = {
  game: string;
  total: number;
  top: LeaderboardEntry[];
};

export type SubmitResponse = {
  ok: true;
  game: string;
  name: string;
  score: number;
  rank: number;
  total: number;
};

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
