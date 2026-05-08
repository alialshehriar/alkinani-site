// yt-dlp wrapper: URL validation (with SSRF guard), metadata probe, download.

import { spawn } from "node:child_process";
import { promisify } from "node:util";
import dns from "node:dns";

const lookup = promisify(dns.lookup);

const PRIVATE_RANGES = [
  /^10\./, /^127\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
  /^169\.254\./, /^0\./,
  /^::1$/, /^fe80:/i, /^fc00:/i, /^fd[0-9a-f]{2}:/i,
];

function isPrivateAddress(addr) {
  return PRIVATE_RANGES.some((rx) => rx.test(addr));
}

export async function validateUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { ok: false, error: "invalid_url" }; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "invalid_scheme" };
  }
  try {
    const { address } = await lookup(parsed.hostname);
    if (isPrivateAddress(address)) return { ok: false, error: "private_ip_blocked" };
  } catch {
    return { ok: false, error: "dns_resolve_failed" };
  }
  return { ok: true };
}

/**
 * Probe a URL with yt-dlp (no download). Returns { duration, title, ext, filesizeMb }.
 */
export function probe(url) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", [
      "--no-warnings", "--no-playlist", "--print-json", "--skip-download",
      "--socket-timeout", "20", url,
    ]);
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp probe failed: ${err.slice(0, 300)}`));
      try {
        const info = JSON.parse(out);
        resolve({
          duration: info.duration ?? null,
          title: info.title ?? "",
          ext: info.ext ?? "mp4",
          filesizeMb: info.filesize_approx ? Math.round(info.filesize_approx / 1e6) : null,
        });
      } catch (e) {
        reject(new Error(`yt-dlp probe parse failed: ${String(e).slice(0, 100)}`));
      }
    });
  });
}

/**
 * Download video to outPath. Resolves on close=0.
 */
export function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", [
      "--no-warnings", "--no-playlist",
      "-f", "best[height<=720][ext=mp4]/best[ext=mp4]/best",
      "-o", outPath,
      "--socket-timeout", "20",
      "--retries", "3",
      url,
    ]);
    let err = "";
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp failed: ${err.slice(0, 300)}`));
      resolve();
    });
  });
}
