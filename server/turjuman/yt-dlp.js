// yt-dlp wrapper: URL validation (with SSRF guard), metadata probe, download.
// On URLs the VPS can't fetch directly (YouTube datacenter blocks, geo gates)
// we fall through to Cobalt, which proxies via residential infra.

import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import dns from "node:dns";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";

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
 * Try yt-dlp first; on failures that look like geo/datacenter blocks
 * (YouTube "Sign in to confirm", 403, etc.) fall through to Cobalt.
 *
 * Cobalt is opt-out: set COBALT_DISABLED=1 to keep yt-dlp-only behaviour.
 */
export async function download(url, outPath) {
  try {
    await ytDlpDownload(url, outPath);
    return { source: "yt-dlp" };
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (process.env.COBALT_DISABLED === "1") throw e;
    if (!shouldTryCobalt(msg)) throw e;
    try {
      await cobaltDownload(url, outPath);
      return { source: "cobalt" };
    } catch (cobaltErr) {
      // Surface the original yt-dlp error since it's usually more actionable
      // for the user (the Cobalt error tends to be opaque proxy noise).
      const cMsg = String(cobaltErr?.message ?? cobaltErr).slice(0, 200);
      throw new Error(`${msg} | cobalt fallback also failed: ${cMsg}`);
    }
  }
}

function ytDlpDownload(url, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", [
      "--no-warnings", "--no-playlist",
      "-f", "best[height<=720][ext=mp4]/best[ext=mp4]/best",
      "-o", outPath,
      "--socket-timeout", "20",
      "--retries", "3",
      // For HLS/DASH streams (TikTok, Instagram, X) yt-dlp downloads
      // hundreds of small fragments serially by default. Pulling 8 at a
      // time gives a 3–5× speed-up on those sources without affecting
      // the final byte-for-byte quality.
      "--concurrent-fragments", "8",
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

// Patterns where Cobalt usually wins because it proxies via residential IPs.
// Don't waste a Cobalt round-trip on permanent errors (404, copyright strike).
const COBALT_TRIGGERS = [
  /sign in to confirm/i,
  /confirm you'?re not a bot/i,
  /HTTP Error 403/i,
  /HTTP Error 429/i,
  /unable to download video data/i,
  /Requested format is not available/i,
  /This video is not available/i,
  /datacenter/i,
];

function shouldTryCobalt(errMsg) {
  return COBALT_TRIGGERS.some((rx) => rx.test(errMsg));
}

/**
 * Hit Cobalt's /api/json with the URL, follow whatever it returns:
 *   - status="redirect" / "tunnel" / "stream" → fetch from `url` and pipe to disk
 *   - status="error" → throw with the reason
 * Cobalt's hosted API rate-limits aggressively; ops can override
 * COBALT_BASE_URL with a self-hosted instance.
 */
async function cobaltDownload(url, outPath) {
  const base = process.env.COBALT_BASE_URL || "https://api.cobalt.tools";
  const r = await fetch(`${base}/api/json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      url,
      videoQuality: "720",
      filenameStyle: "basic",
      downloadMode: "auto",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    throw new Error(`cobalt http ${r.status}`);
  }
  const j = await r.json();
  if (j.status === "error") {
    throw new Error(`cobalt error: ${j.error?.code ?? "unknown"}`);
  }
  const fileUrl = j.url;
  if (!fileUrl) throw new Error(`cobalt missing url (status=${j.status})`);

  const dl = await fetch(fileUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!dl.ok || !dl.body) {
    throw new Error(`cobalt file http ${dl.status}`);
  }
  await streamPipeline(Readable.fromWeb(dl.body), createWriteStream(outPath));
}
