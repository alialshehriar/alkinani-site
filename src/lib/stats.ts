// LocalStorage helpers for the Pressure Test stats (best, streak, plays).

const KEY = "alk-pressure-stats-v1";

export type Stats = {
  best: number;        // best score 0-100
  streak: number;      // consecutive days played
  total: number;       // total plays ever
  lastPlay: string;    // ISO date of last play (yyyy-mm-dd)
  perfect: number;     // count of 90+ scores
};

const empty: Stats = { best: 0, streak: 0, total: 0, lastPlay: "", perfect: 0 };

export function readStats(): Stats {
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function recordPlay(score: number): Stats {
  if (typeof localStorage === "undefined") return empty;
  const cur = readStats();
  const today = todayStr();
  const newStreak =
    cur.lastPlay === today
      ? cur.streak                    // already counted today
      : cur.lastPlay === yesterdayStr()
      ? cur.streak + 1                // consecutive day
      : 1;                            // streak reset
  const next: Stats = {
    best: Math.max(cur.best, score),
    streak: newStreak,
    total: cur.total + 1,
    lastPlay: today,
    perfect: cur.perfect + (score >= 90 ? 1 : 0),
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function resetStats(): Stats {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return empty;
}
