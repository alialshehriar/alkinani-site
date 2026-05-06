// LocalStorage for Pulse memory game stats.

const KEY = "alk-pulse-stats-v1";

export type PulseStats = {
  bestLevel: number;     // highest level reached
  bestScore: number;     // best total score
  total: number;         // total runs
  bestSequence: number;  // longest sequence ever recalled correctly
};

const empty: PulseStats = { bestLevel: 0, bestScore: 0, total: 0, bestSequence: 0 };

export function readPulseStats(): PulseStats {
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PulseStats>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export function recordPulse(level: number, score: number, longestSeq: number): PulseStats {
  if (typeof localStorage === "undefined") return empty;
  const cur = readPulseStats();
  const next: PulseStats = {
    bestLevel: Math.max(cur.bestLevel, level),
    bestScore: Math.max(cur.bestScore, score),
    total: cur.total + 1,
    bestSequence: Math.max(cur.bestSequence, longestSeq),
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
