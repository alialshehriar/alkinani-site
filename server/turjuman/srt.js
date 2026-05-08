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

export function cuesToSrt(cues) {
  return cues
    .map((cue, i) => [
      String(i + 1),
      `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`,
      layoutCueText(String(cue.text).trim()),
      "",
    ].join("\n"))
    .join("\n");
}
