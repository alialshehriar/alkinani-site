// LocalStorage for Tech Sprint stats (separate from Reflex Lab).

const KEY = "alk-sprint-stats-v1";

export type SprintStats = {
  best: number;       // best total score
  bestStreak: number; // best consecutive correct streak
  total: number;      // total runs ever
  perfectFlow: number; // count of runs with 5+ in a row correct
};

const empty: SprintStats = { best: 0, bestStreak: 0, total: 0, perfectFlow: 0 };

export function readSprintStats(): SprintStats {
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SprintStats>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export function recordSprint(score: number, bestStreak: number): SprintStats {
  if (typeof localStorage === "undefined") return empty;
  const cur = readSprintStats();
  const next: SprintStats = {
    best: Math.max(cur.best, score),
    bestStreak: Math.max(cur.bestStreak, bestStreak),
    total: cur.total + 1,
    perfectFlow: cur.perfectFlow + (bestStreak >= 5 ? 1 : 0),
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
