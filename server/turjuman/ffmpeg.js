// ffmpeg subtitle burn-in. Requires Arabic-capable system fonts
// (apt: fonts-noto-core + fonts-hosny-amiri).

import { spawn } from "node:child_process";

const FONTS = {
  ar: "Amiri",          // Naskh-style Arabic, also has Latin glyphs
  en: "Noto Sans",
  es: "Noto Sans",
};

/**
 * Burn the SRT into the source video, producing an output MP4.
 * Uses libass via the `subtitles` filter for proper RTL/shaping.
 */
export function burnSubtitles({ videoPath, srtPath, outPath, targetLang }) {
  return new Promise((resolve, reject) => {
    const font = FONTS[targetLang] ?? "Noto Sans";

    // ASS color spec: &HAABBGGRR
    //   PrimaryColour = white opaque
    //   OutlineColour = black opaque (border)
    //   BackColour    = semi-transparent black box behind text
    //   BorderStyle=1 = outline + drop shadow
    //   Alignment=2   = bottom center
    //   MarginV=40    = lift off bottom edge
    const style = [
      `FontName=${font}`,
      "FontSize=20",
      "PrimaryColour=&H00FFFFFF",
      "OutlineColour=&H00000000",
      "BackColour=&H80000000",
      "BorderStyle=1",
      "Outline=2",
      "Shadow=1",
      "Alignment=2",
      "MarginV=40",
    ].join(",");

    const filter = `subtitles=${escapeFilterPath(srtPath)}:charenc=UTF-8:force_style='${style}'`;

    const args = [
      "-y", "-i", videoPath,
      "-vf", filter,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
      "-c:a", "copy",
      "-movflags", "+faststart",
      outPath,
    ];

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
