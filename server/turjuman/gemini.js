// Gemini 2.5 Pro multimodal client. Uploads media (audio is preferred —
// it's 20× smaller than the source video and Gemini transcribes it just
// as accurately) and asks the model to produce time-coded subtitle cues
// translated into the target language.
//
// Two transport paths:
//   1. inline_data — for media ≤ 19 MB. No upload step, single round-trip.
//   2. Files API   — for anything bigger. Uses the resumable-upload protocol.

import fs from "node:fs/promises";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta";

// Hard cap from Google: ~20 MB for inline base64. We leave 1 MB headroom
// for the JSON envelope + base64 inflation (which adds ~33%).
const INLINE_LIMIT_BYTES = 14 * 1024 * 1024;

// 2.5-pro is back as the default. Flash + thinkingBudget=0 was much faster
// (17s vs 80s on a 3-min clip) but the cue boundaries drifted by 2–3
// seconds — Ali called it out: "الترجمه تجي في اوقات غلط ومو مضبوطه صح".
// Pro spends compute on aligning each cue to the exact audio moment, so we
// pay the latency to keep timing tight. Override via GEMINI_MODEL if you
// want to experiment. The other speed-ups (audio-only upload, ultrafast
// burn, increased Files API timeout) all stay.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";
const FETCH_TIMEOUT_MS = Number(process.env.GEMINI_FETCH_TIMEOUT_MS || 10 * 60 * 1000);

const CUE_RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      start: { type: "number", description: "Cue start time in seconds." },
      end: { type: "number", description: "Cue end time in seconds." },
      text: { type: "string", description: "Translated subtitle text." },
    },
    required: ["start", "end", "text"],
  },
};

const LANGUAGE_CONFIG = {
  ar: {
    name: "Arabic (ar)",
    conventions: [
      "use Arabic script, Arabic punctuation (، and ؛). Use Arabic",
      "  numerals (٠١٢٣) for narrative numbers, keep Latin numerals for product/",
      "  version names. Modern Standard Arabic by default. Preserve Najdi/Hijazi",
      "  flavor when source is colloquial Arabic.",
    ],
    maxChars: "≤ 44 characters Arabic",
  },
  en: {
    name: "English (en)",
    conventions: ["natural conversational English, sentence case."],
    maxChars: "≤ 84 characters Latin",
  },
  es: {
    name: "Spanish (es)",
    conventions: ["natural conversational Spanish."],
    maxChars: "≤ 84 characters Latin",
  },
  zh: {
    name: "Simplified Chinese / Mandarin (zh)",
    conventions: [
      "use Simplified Chinese characters, natural Mandarin phrasing, and Chinese",
      "  punctuation (，。！？). Do not add spaces between Chinese words. Preserve",
      "  names, brands, handles, and product names verbatim when translation would",
      "  make them ambiguous.",
    ],
    maxChars: "≤ 36 Chinese characters",
  },
};

const PROMPT = (targetLang, chunkOffsetSec) => {
  const lang = LANGUAGE_CONFIG[targetLang] ?? {
    name: targetLang,
    conventions: ["natural fluent translation for the requested target language."],
    maxChars: "≤ 84 characters",
  };
  const chunkRule = Number.isFinite(chunkOffsetSec)
    ? `- This attached media is one chunk from a longer source. Return timestamps RELATIVE to the start of THIS attached chunk only; do not add the ${chunkOffsetSec}s global offset.`
    : null;

  return `
You are a professional subtitle translator.

Watch/listen to the attached media. Produce a JSON array of subtitle cues.
Translate every intelligible spoken sentence or phrase. Do not summarize, compress,
or omit repeated/hesitant speech unless it is truly unintelligible. Each cue must
have:
- "start": seconds, float, when the line starts
- "end": seconds, float, when the line ends
- "text": the spoken line translated into the target language

Target language: ${lang.name}

Language conventions:
- ${lang.conventions.join("\n- ")}

Rules:
- Each cue text ${lang.maxChars} AND MUST be a SINGLE LINE.
  NEVER include line breaks (\n) inside a cue's "text" field — the player
  will wrap automatically. If a phrase is longer than ${lang.maxChars}, split
  it into TWO consecutive cues with separate start/end timestamps instead of
  forcing a line break inside one cue.
- Create cues for every spoken segment, including short confirmations, side
  comments, and sentence fragments.
- If the source speech is uncertain, provide the best-effort translation instead
  of dropping the line.
- Break at natural sentence boundaries; do NOT break inside جار+مجرور or
  مضاف+إليه (Arabic).
- Preserve product/brand names verbatim (Postgres, OpenAI, etc.).
- Mark non-speech audio: ♪ for music, (laughter) / (ضحك) for laughter.

Timing rules (very important):
- Cue "start" = the EXACT moment the speaker BEGINS that line (don't lead in).
- Cue "end"   = the moment the speaker FINISHES the line. Don't extend into
  silence or into the next speaker's line.
- Each cue ≥ 0.8 seconds and ≤ 6 seconds.
- Tight short utterances (e.g. one-word agreements) keep their natural ≥1s
  visible duration.
- If two consecutive lines are spoken back-to-back, leave at least 0.1s gap
  in your timestamps.
${chunkRule ?? ""}

Output ONLY the JSON array. No prose, no markdown fences.
`.trim();
};

/**
 * Translate a list of audio chunks in parallel and return a single
 * unified cues array with global timestamps.
 *
 * Each chunk gets its own Gemini call so the model can't drift in
 * timestamp estimation across long durations (the failure mode Ali hit
 * on 14-min clips: cues that "wandered" 10-30 seconds off the actual
 * speech). Concurrency is capped so we don't trip rate limits.
 */
export async function translateChunked({
  apiKey,
  chunks,
  mimeType,
  targetLang,
  log,
  concurrency = 2,
  onProgress,
}) {
  if (!chunks?.length) throw new Error("no_chunks");

  log?.(`[gemini] chunked: ${chunks.length} × ~chunk @ concurrency ${concurrency}`);
  const results = new Array(chunks.length);
  let completed = 0;

  // Simple worker pool — kick off `concurrency` workers each pulling the
  // next chunk index off a shared counter.
  let idx = 0;
  async function worker(workerId) {
    while (true) {
      const i = idx++;
      if (i >= chunks.length) return;
      const ch = chunks[i];
      try {
        const cues = await withRetries(async () => translateMedia({
          apiKey,
          mediaPath: ch.path,
          mimeType,
          targetLang,
          log: () => {}, // suppress per-chunk noise; we log aggregate below
          chunkOffsetSec: ch.offsetSec,
        }), {
          attempts: 3,
          label: `chunk ${i} @ ${ch.offsetSec}s`,
          log,
        });
        results[i] = shiftChunkCues(cues, ch);
        completed++;
        onProgress?.({ completed, total: chunks.length, chunkIndex: i });
      } catch (e) {
        const msg = String(e?.message || e).slice(0, 100);
        log?.(`[gemini] chunk ${i} (offset ${ch.offsetSec}s) failed after retries: ${msg}`);
        throw new Error(`gemini_chunk_failed:${i}:${msg}`);
      }
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, (_, w) => worker(w)));
  log?.(`[gemini] chunked total ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Concatenate, sort by start time (chunks finish out of order under
  // parallel work), and dedupe identical cues.
  const all = results.flat().sort((a, b) => a.start - b.start);
  if (all.length === 0) throw new Error("gemini_no_cues_chunked");
  return mergeNearDuplicateCues(all);
}

/**
 * Run a translation. `mediaPath` is the file on disk (audio.m4a or video.mp4
 * — Gemini accepts either). `mimeType` should match.
 *
 * Picks inline_data for small files (1 round-trip) and Files API for big ones.
 * Returns the parsed cues array (with timestamps relative to the start of
 * the supplied media).
 */
export async function translateMedia({ apiKey, mediaPath, mimeType, targetLang, log, chunkOffsetSec }) {
  if (!apiKey) throw new Error("missing_gemini_key");

  const stat = await fs.stat(mediaPath);
  const useInline = stat.size <= INLINE_LIMIT_BYTES;
  log?.(`[gemini] media=${(stat.size / 1024 / 1024).toFixed(1)}MB transport=${useInline ? "inline" : "files-api"}`);

  let mediaPart;
  if (useInline) {
    const bytes = await fs.readFile(mediaPath);
    mediaPart = { inlineData: { mimeType, data: bytes.toString("base64") } };
  } else {
    const fileUri = await uploadViaFilesApi({ apiKey, mediaPath, mimeType, log });
    mediaPart = { fileData: { mimeType, fileUri } };
  }

  const genUrl = `${API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`;
  const genBody = {
    contents: [{
      role: "user",
      parts: [
        mediaPart,
        { text: PROMPT(targetLang, chunkOffsetSec) },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: CUE_RESPONSE_SCHEMA,
      temperature: 0.1,
      // Pro 400-errors on this knob, only Flash accepts it. When using
      // Flash, setting thinkingBudget=0 cuts ~75% off the generate
      // latency — but Ali's feedback was that Flash with thinking off
      // produces drifted cue boundaries, so we only enable it if someone
      // explicitly opts into Flash via GEMINI_MODEL.
      ...(/-flash/.test(MODEL) && { thinkingConfig: { thinkingBudget: 0 } }),
    },
  };

  const t0 = Date.now();
  const genRes = await fetch(genUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(genBody),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!genRes.ok) {
    throw new Error(`gemini_gen_failed: ${genRes.status} ${(await genRes.text()).slice(0, 300)}`);
  }
  const data = await genRes.json();
  log?.(`[gemini] generate took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`gemini_empty_response: ${JSON.stringify(data).slice(0, 300)}`);

  return parseCues(text);
}

async function withRetries(fn, { attempts, label, log }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = String(e?.message || e).slice(0, 120);
      if (attempt >= attempts) break;
      const waitMs = 1200 * attempt;
      log?.(`[gemini] ${label} attempt ${attempt}/${attempts} failed (${msg}); retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

function mergeNearDuplicateCues(cues) {
  const merged = [];
  for (const cue of cues) {
    const prev = merged.at(-1);
    if (
      prev &&
      prev.text === cue.text &&
      Math.abs(prev.end - cue.start) <= 0.35
    ) {
      prev.end = Math.max(prev.end, cue.end);
    } else {
      merged.push({ ...cue });
    }
  }
  return merged;
}

function shiftChunkCues(cues, ch) {
  const durationSec = Number.isFinite(ch.durationSec) && ch.durationSec > 0 ? ch.durationSec : null;
  const offsetSec = Number(ch.offsetSec) || 0;

  // Gemini occasionally follows the global timestamp context despite the
  // prompt. If most cue starts sit inside the chunk's global window, treat
  // them as global and convert back to local before applying the measured
  // offset.
  const globalWindowEnd = offsetSec + (durationSec ?? 120) + 3;
  const globalish = offsetSec > 1 && cues.length > 0 &&
    cues.filter((c) => c.start >= offsetSec - 1 && c.start <= globalWindowEnd).length >= Math.ceil(cues.length * 0.6);

  return cues
    .map((c) => {
      const localStart = globalish ? c.start - offsetSec : c.start;
      const localEnd = globalish ? c.end - offsetSec : c.end;
      return {
        start: Math.max(0, localStart) + offsetSec,
        end: Math.max(0, localEnd) + offsetSec,
        text: c.text,
      };
    })
    .filter((c) => {
      if (!durationSec) return c.end > c.start;
      const localStart = c.start - offsetSec;
      return c.end > c.start && localStart <= durationSec + 2;
    })
    .map((c) => {
      if (!durationSec) return c;
      const maxEnd = offsetSec + durationSec + 2;
      return { ...c, end: Math.min(c.end, maxEnd) };
    });
}

/** Backwards-compatible alias kept in case any caller still imports the old name. */
export const translateVideo = async ({ apiKey, videoBytes, mimeType, targetLang, log }) => {
  // Write the bytes to a temp file so we can reuse the unified upload path.
  const os = await import("node:os");
  const path = await import("node:path");
  const crypto = await import("node:crypto");
  const tmp = path.join(os.tmpdir(), `turjuman-${crypto.randomBytes(6).toString("hex")}.mp4`);
  await fs.writeFile(tmp, videoBytes);
  try {
    return await translateMedia({ apiKey, mediaPath: tmp, mimeType, targetLang, log });
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
};

async function uploadViaFilesApi({ apiKey, mediaPath, mimeType, log }) {
  const stat = await fs.stat(mediaPath);
  const startRes = await fetch(`${UPLOAD_BASE}/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(stat.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "turjuman.media" } }),
  });
  if (!startRes.ok) {
    throw new Error(`gemini_upload_start: ${startRes.status} ${(await startRes.text()).slice(0, 200)}`);
  }
  const uploadUrl =
    startRes.headers.get("X-Goog-Upload-URL") ??
    startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("gemini_upload_no_url");

  const t0 = Date.now();
  const bytes = await fs.readFile(mediaPath);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!uploadRes.ok) {
    throw new Error(`gemini_upload_body: ${uploadRes.status} ${(await uploadRes.text()).slice(0, 200)}`);
  }
  const uploaded = await uploadRes.json();
  const fileUri = uploaded?.file?.uri;
  if (!fileUri) throw new Error("gemini_upload_no_uri");
  log?.(`[gemini] upload took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await waitFileActive(uploaded.file.name, apiKey);
  return fileUri;
}

// Files API can take up to a couple of minutes to mark a long video/audio
// as ACTIVE. The previous 30 × 1.5s = 45s window was triggering false
// timeouts on 25-min source clips. 90 × 2s = 180s covers the long tail.
async function waitFileActive(name, apiKey, attempts = 90, intervalMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${API_BASE}/${name}?key=${apiKey}`);
    if (res.ok) {
      const info = await res.json();
      if (info?.state === "ACTIVE") return;
      if (info?.state === "FAILED") throw new Error("gemini_file_state_failed");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("gemini_file_active_timeout");
}

/**
 * Parse Gemini's JSON-array response into cues. Strips markdown fences and
 * filters malformed entries.
 */
export function parseCues(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let arr;
  try {
    const parsed = JSON.parse(cleaned);
    arr = Array.isArray(parsed)
      ? parsed
      : parsed?.cues ?? parsed?.subtitles ?? parsed?.segments;
  } catch (e) {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        arr = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        throw new Error(`gemini_json_parse: ${String(e).slice(0, 100)}; head=${cleaned.slice(0, 100)}`);
      }
    } else {
      throw new Error(`gemini_json_parse: ${String(e).slice(0, 100)}; head=${cleaned.slice(0, 100)}`);
    }
  }
  if (!Array.isArray(arr)) throw new Error("gemini_not_array");

  const cues = arr
    .map((c) => ({
      start: coerceSeconds(c?.start),
      end: coerceSeconds(c?.end),
      text: typeof c?.text === "string" ? c.text.trim() : "",
    }))
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.text && c.end > c.start);
  if (cues.length === 0) throw new Error("gemini_no_cues");
  return cues;
}

function coerceSeconds(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const m = trimmed.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?$/);
  if (!m) return NaN;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return h * 3600 + min * 60 + sec + ms / 1000;
}
