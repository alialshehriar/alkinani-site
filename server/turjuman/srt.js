// SRT formatter: cue → SubRip text, with Netflix/BBC line-break rules.

const ARABIC_RX = /[؀-ۿ]/;
const CJK_RX = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const LEAD_IN_SEC = 0.15;
const MIN_DURATION_SEC = 1.2;
const MIN_TIGHT_DURATION_SEC = 0.6;
const MAX_DURATION_SEC = 7;
const MIN_GAP_SEC = 0.08;

function pad(n, w) { return String(n).padStart(w, "0"); }

export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function isArabic(text) { return ARABIC_RX.test(text); }
function isCjk(text) { return CJK_RX.test(text); }

/**
 * Greedy line-break: words are appended until adding one more would exceed
 * `maxChars`. Words longer than `maxChars` are hard-split.
 */
export function splitLongLine(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      if (w.length > maxChars) {
        let rest = w;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        line = rest;
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lay out cue text into ≤ 2 lines respecting char budget. Overflow merges
 * into the second line (truncation accepted in MVP).
 */
function layoutCueText(text) {
  const maxChars = isArabic(text) ? 22 : isCjk(text) ? 18 : 42;
  const lines = splitLongLine(text, maxChars);
  if (lines.length <= 2) return lines.join("\n");
  return [lines[0], lines.slice(1).join(" ")].join("\n");
}

/**
 * Smooth out raw model timings into a more readable subtitle track:
 *   - sort by start time (defensive)
 *   - 150ms lead-in (subtitle appears just before speech starts)
 *   - min on-screen duration 1.2s (eye needs time to land on the line)
 *   - max on-screen duration 7s (don't let a cue linger forever)
 *   - min 80ms gap between adjacent cues (no flicker / no overlap)
 */
export function normalizeCues(rawCues) {
  if (!Array.isArray(rawCues) || rawCues.length === 0) return [];

  const cues = [...rawCues]
    .filter((c) => typeof c.start === "number" && typeof c.end === "number")
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      start: Math.max(0, c.start - LEAD_IN_SEC),
      end: c.end,
      text: String(c.text).trim(),
    }))
    .filter((c) => c.text.length > 0);

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.end - c.start < MIN_DURATION_SEC) c.end = c.start + MIN_DURATION_SEC;
    if (c.end - c.start > MAX_DURATION_SEC) c.end = c.start + MAX_DURATION_SEC;

    const next = cues[i + 1];
    if (next) {
      // Prefer clipping the current cue to preserve the next cue's speech
      // onset. If the cues are extremely tight, allow a shorter display
      // duration rather than producing overlapping subtitles.
      if (c.end + MIN_GAP_SEC > next.start) {
        const clippedEnd = next.start - MIN_GAP_SEC;
        if (clippedEnd > c.start) {
          c.end = Math.max(c.start + MIN_TIGHT_DURATION_SEC, clippedEnd);
          if (c.end + MIN_GAP_SEC > next.start) c.end = clippedEnd;
        } else {
          next.start = c.end + MIN_GAP_SEC;
        }
      }
    }
  }
  return cues;
}

export function cuesToSrt(cues) {
  const normalized = normalizeCues(cues);
  return normalized
    .map((cue, i) => [
      String(i + 1),
      `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`,
      layoutCueText(String(cue.text).trim()),
      "",
    ].join("\n"))
    .join("\n");
}
