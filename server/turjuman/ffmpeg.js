// ffmpeg subtitle burn-in + fast audio extraction for Gemini.
// Requires Arabic-capable system fonts (apt: fonts-noto-core + fonts-hosny-amiri).

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Strip the audio out of a video and normalize it for speech recognition.
 * Mono 24kHz AAC at 64kbps keeps spoken-word clarity while cutting upload
 * size versus the original stereo track. This saves time on every Gemini
 * request, especially for chunked long-form videos.
 *
 * Returns { path, mimeType }.
 */
export async function extractAudio(videoPath) {
  const dir = path.dirname(videoPath);
  const outSpeech = path.join(dir, "audio.m4a");

  const speechOk = await runFfmpeg([
    "-y", "-i", videoPath,
    "-vn",
    "-ac", "1",
    "-ar", "24000",
    "-c:a", "aac",
    "-b:a", "64k",
    "-movflags", "+faststart",
    outSpeech,
  ]);
  if (speechOk) {
    return { path: outSpeech, mimeType: "audio/mp4" };
  }

  // Fallback: stream-copy the source audio if the speech-normalized encode
  // fails for an unusual input. It may be larger, but it keeps the job alive.
  const outCopy = path.join(dir, "audio.copy.m4a");
  const copyOk = await runFfmpeg([
    "-y", "-i", videoPath,
    "-vn",
    "-c:a", "copy",
    "-movflags", "+faststart",
    outCopy,
  ]);
  if (!copyOk) throw new Error("audio_extract_failed");
  return { path: outCopy, mimeType: "audio/mp4" };
}

/**
 * Run ffmpeg's volumedetect filter against an audio file and return the
 * mean_volume in dBFS (negative number; 0 = full scale, -inf = silence).
 * Resolves to null if ffmpeg fails or the regex doesn't match.
 *
 * Used as a pre-flight gate before Gemini: silent/near-silent clips burn
 * API quota and reliably return zero cues or hallucinated filler phrases.
 * On 2026-05-16 silent uploads were 38% of the gemini_no_cues errors.
 */
export function measureMeanVolume(audioPath) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-i", audioPath,
      "-af", "volumedetect",
      "-vn", "-sn", "-dn",
      "-f", "null", "-",
    ]);
    let err = "";
    p.stderr.on("data", (b) => { err += b; if (err.length > 8000) err = err.slice(-8000); });
    p.on("close", () => {
      const m = err.match(/mean_volume:\s*(-?\d+\.?\d*)\s*dB/);
      resolve(m ? parseFloat(m[1]) : null);
    });
    p.on("error", () => resolve(null));
  });
}

function runFfmpeg(args) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (b) => { err += b; if (err.length > 2000) err = err.slice(-2000); });
    p.on("close", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

/**
 * Split an audio file into N-second windows using stream copy (no
 * re-encode). Returns the chunk paths in order with their measured
 * start-time offsets. FFmpeg's segment muxer can land a boundary a few
 * packets away from the requested time, so we calculate offsets from each
 * produced chunk's real duration instead of assuming i * chunkSec. That is
 * what keeps long-video subtitles from slowly drifting.
 *
 * We deliberately keep chunks short (default 60s) so each
 * Gemini call sees a small window and can't drift in its timestamp
 * estimates the way it does over a 10–25-minute clip — that drift is
 * what was producing the "الكلام شاطح" timing on long videos.
 */
export async function chunkAudio(audioPath, chunkSec = 60) {
  const dir = path.dirname(audioPath);
  const stem = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const pattern = path.join(dir, `${stem}_%04d.m4a`);

  const ok = await runFfmpeg([
    "-y", "-i", audioPath,
    "-f", "segment",
    "-segment_time", String(chunkSec),
    "-reset_timestamps", "1",
    "-c", "copy",
    pattern,
  ]);
  if (!ok) throw new Error("audio_chunk_failed");

  // Discover the produced files (ffmpeg numbers them sequentially).
  const all = await fs.readdir(dir);
  const files = all
    .filter((f) => f.startsWith(`${stem}_`) && f.endsWith(".m4a"))
    .sort();

  const chunks = [];
  let offsetSec = 0;
  for (let i = 0; i < files.length; i++) {
    const chunkPath = path.join(dir, files[i]);
    const durationSec = await probeMediaDuration(chunkPath).catch(() => null);
    chunks.push({
      path: chunkPath,
      offsetSec,
      durationSec,
    });
    offsetSec += Number.isFinite(durationSec) && durationSec > 0 ? durationSec : chunkSec;
  }
  return chunks;
}

function probeMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe duration failed: ${err.slice(0, 120)}`));
      const duration = parseFloat(out.trim());
      if (!Number.isFinite(duration)) return reject(new Error("ffprobe duration parse failed"));
      resolve(duration);
    });
    p.on("error", reject);
  });
}

// Noto Naskh Arabic — Google's modernised Naskh face. Larger x-height than
// Amiri so subtitles read clearly at small sizes, but with full ligature
// support (لا, الله, etc.) that Noto Sans Arabic Bold mis-shapes inside
// libass — the sans-serif version was producing tofu boxes in lam-alef
// pairs ("دو□لار", "□لا"), Naskh handles them cleanly.
// Modern social-video subtitle fonts. Switched from Noto Naskh (book-style,
// thin strokes that get lost on busy backgrounds) to system-installed
// geometric/humanist sans options that pop with a thick outline. SF Arabic
// is Apple's modern screen-optimized Arabic typeface — bold weight reads
// cleanly at any size. Fallbacks via fontconfig if the primary is missing.
// On the VPS (Ubuntu 24.04, package fonts-noto-core) the only Arabic faces
// guaranteed present are Noto Sans/Naskh/Kufi Arabic, each with a real Bold
// weight. The previous "SF Arabic" was an Apple-only name → fontconfig
// substituted it to NotoSansArabic-Regular (book weight), which is what was
// washing out under thick outlines. Switching to "Noto Sans Arabic" + the
// existing Bold flag in [V4+ Styles] gives genuinely thicker strokes without
// requiring a new apt install. If IBM Plex Sans Arabic or Tajawal Bold gets
// added to the host later, libass will prefer the first match via fontconfig.
const FONTS = {
  ar: "IBM Plex Sans Arabic,Tajawal,Noto Sans Arabic",
  en: "Inter,Helvetica Neue,Arial",
  es: "Inter,Helvetica Neue,Arial",
  zh: "Noto Sans CJK SC,PingFang SC",
};

/**
 * Probe a video file for its display width/height. We need the real frame
 * dimensions because libass interprets MarginV/FontSize relative to the
 * script's PlayResX/PlayResY — if we don't pin those to the actual frame
 * size, libass falls back to a 384×288 default canvas and the subtitle
 * lands ~150px above the bottom on a 720p clip (the "subtitle in the
 * middle of the video" bug on portrait/letterboxed sources).
 */
function probeDims(filePath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0:s=x",
      filePath,
    ]);
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const m = out.trim().match(/^(\d+)x(\d+)/);
      if (!m) return resolve(null);
      const w = parseInt(m[1], 10);
      const h = parseInt(m[2], 10);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return resolve(null);
      }
      resolve({ w, h });
    });
  });
}

/** "00:01:23,456" → "0:01:23.45" (ASS timestamp, centiseconds). */
function srtTimeToAss(ts) {
  const m = ts.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!m) return "0:00:00.00";
  const h = parseInt(m[1], 10);
  const min = m[2];
  const sec = m[3];
  const cs = String(Math.floor(parseInt(m[4], 10) / 10)).padStart(2, "0");
  return `${h}:${min}:${sec}.${cs}`;
}

/**
 * Convert SRT → ASS with explicit PlayResX/Y locked to the actual video
 * frame. Inside the script, MarginV and FontSize then read in real pixels:
 * MarginV=80 → subtitle baseline 80px from the bottom regardless of
 * aspect ratio.
 */
function srtToAss(srtText, { w, h, font, fontSize, marginV, marginH }) {
  // Parse SRT cues into { start, end, text } triples. Robust to CRLF and
  // numeric-only first lines per cue.
  const blocks = srtText.replace(/\r/g, "").split(/\n\n+/).filter(Boolean);
  const cues = [];
  for (const blk of blocks) {
    const lines = blk.split("\n");
    // Skip the optional cue index on the first line.
    const tIdx = lines[0].includes("-->") ? 0 : 1;
    const tline = lines[tIdx];
    if (!tline || !tline.includes("-->")) continue;
    const [start, end] = tline.split("-->").map((s) => s.trim());
    // FORCE single-line body. Strip any \n/\N the cue may carry from older
    // SRTs or models that ignored the single-line-cue prompt. libass with
    // WrapStyle=0 will balance-wrap based on margin width — much better than
    // arbitrary mid-cue breaks like "تصبح أكثر فائدة\Nقدرة." that leave a
    // single short word on its own line.
    const body = lines.slice(tIdx + 1).join(" ").replace(/\s*\\N\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!body) continue;
    cues.push({ start, end, body });
  }

  // Outline + shadow scale with frame size for consistent visual weight
  // across resolutions. Bumped from 0.65% → 1.0% of frame height (≈7px @ 720p,
  // ≈10px @ 1080p) so the white text stays readable on any background.
  // Shadow tightened to 2.2px @ 720p to add depth without softening edges.
  const outline = Math.max(4, Math.round(h * 0.010));
  const shadow = Math.max(1, Math.round(h * 0.003));

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    // WrapStyle: 0 = smart wrap (libass balances line lengths automatically
    // when a cue exceeds MarginL+MarginR width). Combined with our stripping
    // of \N from cue bodies, this gives clean, balanced 1-2 line subtitles.
    "WrapStyle: 0",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Modern social-video style (TikTok/Reels/X look):
    //   PrimaryColour = white opaque (&H00FFFFFF)
    //   OutlineColour = black opaque (&H00000000) — thick edge for any background
    //   BackColour    = fully TRANSPARENT (&HFF000000) — no box
    //   BorderStyle=1 = outline + drop shadow (NOT box). Clean look.
    //   Outline       = thick (~5px @ 720p) — readable on busy frames
    //   Shadow        = 2px — adds depth without distracting
    //   Alignment=2   = bottom center
    //   MarginV       = pixels from bottom (more breathing room than v1)
    `Style: Default,${font},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&HFF000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = cues
    .map(
      (c) =>
        `Dialogue: 0,${srtTimeToAss(c.start)},${srtTimeToAss(c.end)},Default,,0,0,0,,${c.body}`
    )
    .join("\n");

  return `${header}\n${events}\n`;
}

// User-facing size picker → frame-height multiplier on the base font size.
// "M" is the canonical default and matches what gets shown when subtitleSize
// is null/undefined (legacy jobs predating the column).
//
// Calibrated from the 2026-05-17 readability pass — the previous 8% base
// was still washing out on busy backgrounds; bumping the M default to 10.5%
// and giving users an explicit "L" knob covers Ali's stated complaint
// without making short clips look like a meme.
const SIZE_SCALE = { S: 0.85, M: 1.0, L: 1.18 };
const SIZE_BASE_FRAC = 0.105; // ≈10.5% of frame height at "M"

/**
 * Burn the SRT into the source video, producing an output MP4.
 * Generates a PlayRes-locked ASS file from the SRT so libass renders
 * margins/fonts in actual pixel space — works on landscape, portrait,
 * and letterboxed sources alike.
 *
 * `subtitleSize` ∈ {"S","M","L"} multiplies the base font size; null/undefined
 * is treated as "M".
 */
export async function burnSubtitles({ videoPath, srtPath, outPath, targetLang, subtitleSize }) {
  const font = FONTS[targetLang] ?? "Noto Sans";

  // Probe first; if it fails we still try a sensible default.
  const dims = (await probeDims(videoPath)) ?? { w: 1280, h: 720 };
  const { w, h } = dims;

  const sizeKey = (subtitleSize === "S" || subtitleSize === "L") ? subtitleSize : "M";
  const sizeMul = SIZE_SCALE[sizeKey];

  // Modern social-video tuning (TikTok/Reels readability on small screens).
  //   MarginV  ≈ 13% of frame height — clear breathing room from bottom edge
  //   FontSize ≈ 10.5% × sizeMul of frame height (was 8%; Ali reported still
  //              not big enough for older relatives reading on a phone)
  //   marginH  ≈ 7% — narrow text column → fewer awkward wraps
  const marginV = Math.max(80, Math.min(220, Math.round(h * 0.13)));
  const fontSize = Math.max(44, Math.min(140, Math.round(h * SIZE_BASE_FRAC * sizeMul)));
  const marginH = Math.max(50, Math.min(180, Math.round(w * 0.07)));

  const srtText = await fs.readFile(srtPath, "utf8");
  const assText = srtToAss(srtText, { w, h, font, fontSize, marginV, marginH });
  const assPath = path.join(path.dirname(srtPath), "translation.ass");
  await fs.writeFile(assPath, assText, "utf8");

  const filter = `subtitles=${escapeFilterPath(assPath)}`;

  const args = [
    "-y", "-i", videoPath,
    "-vf", filter,
    "-c:v", "libx264",
    // ultrafast at the same CRF target produces a ~15-20% bigger file but
    // halves the encode time, with no perceptible visual difference on
    // burnt-in subtitle content. For long clips (15-25 min) this is the
    // single biggest reduction in user-visible latency.
    "-preset", "ultrafast",
    "-crf", "24",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-threads", "0",
    outPath,
  ];

  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (b) => { err += b; if (err.length > 4000) err = err.slice(-4000); });
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg burn failed (rc=${code}): ${err.slice(-400)}`));
      resolve();
    });
  });
}

/**
 * The libass `subtitles=` filter syntax requires escaping `:`, `\`, and `'`.
 * Job paths are nanoid-only so this is mostly defensive.
 */
function escapeFilterPath(p) {
  return p
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}
