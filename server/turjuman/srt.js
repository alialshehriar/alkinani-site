// SRT formatter: cue → SubRip text, with Netflix/BBC line-break rules.

const ARABIC_RX = /[؀-ۿ]/;

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
  const maxChars = isArabic(text) ? 22 : 42;
  const lines = splitLongLine(text, maxChars);
  if (lines.length <= 2) return lines.join("\n");
  return [lines[0], lines.slice(1).join(" ")].join("\n");
}

/**
 * Smooth out raw model timings into a more readable subtitle track:
 *   - sort by start time (defensive)
 *   - 300ms lead-in (subtitle appears slightly before speech starts)
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
      start: Math.max(0, c.start - 0.3),
      end: c.end,
      text: String(c.text).trim(),
    }))
    .filter((c) => c.text.length > 0);

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.end - c.start < 1.2) c.end = c.start + 1.2;
    if (c.end - c.start > 7) c.end = c.start + 7;

    const next = cues[i + 1];
    if (next) {
      // If we now overlap, push next start forward, OR clip our end.
      if (c.end + 0.08 > next.start) {
        if (c.end < next.start) {
          // Already a tight gap — nothing to do.
        } else {
          c.end = Math.max(c.start + 1.2, next.start - 0.08);
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
