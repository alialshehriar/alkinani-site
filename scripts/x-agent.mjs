#!/usr/bin/env node
// X Agent — runs on local Mac (where codad's logged-in Chrome :9223 lives)
// because Hostinger VPS IP is rate-limited / login-walled by X.
//
// For each tracked X handle and search query:
//   1. agent-browser open <url>
//   2. agent-browser eval <extract-js>  → JSON array of tweets
//   3. dedupe + filter freshness window
// Then POST { items: [...] } → https://alkinani.live/api/radar/ingest
// (auth via X-Radar-Secret header).
//
// Run via local cron (e.g. every 12 min):
//   */12 * * * * cd /Users/a.s/alkinani-site && node scripts/x-agent.mjs >> /tmp/alk-x-agent.log 2>&1
//
// Env:
//   ALK_RADAR_INGEST_URL   default https://alkinani.live/api/radar/ingest
//   ALK_RADAR_SECRET       required — must match VPS RADAR_REFRESH_SECRET
//   ALK_X_CDP_PORT         default 9223
//   ALK_X_DRY              "1" — extract & log, don't POST
//   ALK_X_VERBOSE          "1" — verbose logging

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "radar-config.json"), "utf8"));
const INGEST_URL = process.env.ALK_RADAR_INGEST_URL || "https://alkinani.live/api/radar/ingest";
const SECRET = process.env.ALK_RADAR_SECRET || "";
const CDP_PORT = parseInt(process.env.ALK_X_CDP_PORT || "9223", 10);
const DRY = process.env.ALK_X_DRY === "1";
const VERBOSE = process.env.ALK_X_VERBOSE === "1";

function log(...a) { console.log(new Date().toISOString(), "[x-agent]", ...a); }
function vlog(...a) { if (VERBOSE) log(...a); }
function err(...a) { console.error(new Date().toISOString(), "[x-agent][ERR]", ...a); }

/* ----- agent-browser wrapper ----- */

function runAB(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn("agent-browser", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => stdout += d.toString());
    proc.stderr.on("data", (d) => stderr += d.toString());
    const t = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error(`agent-browser ${args[0]} timeout`)); }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`agent-browser ${args[0]} rc=${code}: ${stderr.slice(0, 200)}`));
      resolve(stdout);
    });
    proc.on("error", reject);
  });
}

async function abConnect() {
  await runAB(["connect", String(CDP_PORT)], 10000);
  vlog(`connected to CDP :${CDP_PORT}`);
}

async function abOpen(url) {
  await runAB(["open", url], 25000);
  // Wait for X's tweet renderer to settle.
  await new Promise(r => setTimeout(r, 2200));
}

function runABStdin(args, stdinJs, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn("agent-browser", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => stdout += d.toString());
    proc.stderr.on("data", (d) => stderr += d.toString());
    const t = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error(`agent-browser ${args[0]} timeout`)); }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`agent-browser ${args[0]} rc=${code}: ${stderr.slice(0, 200)}`));
      resolve(stdout);
    });
    proc.on("error", reject);
    proc.stdin.write(stdinJs);
    proc.stdin.end();
  });
}

async function abEval(js) {
  // Send via stdin to avoid argv length + shell-escaping issues for big JS.
  const raw = await runABStdin(["eval", "--stdin"], js, 25000);
  const outer = raw.trim();
  let s;
  try { s = JSON.parse(outer); } catch { s = outer; }
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}

/* ----- Tweet extractor (runs in page context) ----- */

const EXTRACT_TWEETS_JS = `
(() => {
  const out = [];
  const articles = document.querySelectorAll('article[data-testid="tweet"], article[role="article"]');
  const num = (el) => {
    if (!el) return 0;
    const t = (el.textContent || "").trim().replace(/[,\\s]/g, "").toLowerCase();
    if (!t || t === "·" || t === ".") return 0;
    const m = t.match(/^([0-9.]+)([kmb]?)$/);
    if (!m) return parseInt(t, 10) || 0;
    const n = parseFloat(m[1]); const unit = m[2];
    return Math.round(n * (unit === "k" ? 1000 : unit === "m" ? 1e6 : unit === "b" ? 1e9 : 1));
  };
  for (const a of articles) {
    try {
      const link = a.querySelector('a[href*="/status/"][role="link"]')
                 || a.querySelector('a[href*="/status/"]');
      if (!link) continue;
      const href = link.getAttribute("href") || "";
      const m = href.match(/\\/([^\\/]+)\\/status\\/(\\d+)/);
      if (!m) continue;
      const handle = m[1]; const id = m[2];

      const textEl = a.querySelector('[data-testid="tweetText"]');
      const text = textEl ? textEl.innerText : "";

      const timeEl = a.querySelector("time");
      const ts = timeEl ? Date.parse(timeEl.getAttribute("datetime") || "") : 0;

      const repliesEl = a.querySelector('[data-testid="reply"]');
      const retweetsEl = a.querySelector('[data-testid="retweet"]') || a.querySelector('[data-testid="unretweet"]');
      const likesEl = a.querySelector('[data-testid="like"]') || a.querySelector('[data-testid="unlike"]');
      const bookmarksEl = a.querySelector('[data-testid="bookmark"]') || a.querySelector('[data-testid="removeBookmark"]');
      const viewsLink = a.querySelector('a[href*="/analytics"]');

      const replies = num(repliesEl);
      const retweets = num(retweetsEl);
      const likes = num(likesEl);
      const bookmarks = num(bookmarksEl);
      const views = viewsLink ? num(viewsLink) : 0;

      const media = [];
      a.querySelectorAll('img[src*="pbs.twimg.com/media"]').forEach((img) => {
        if (img.src) media.push(img.src);
      });

      // Skip retweets that aren't from this handle (don't want duplicates).
      const socialContext = a.querySelector('[data-testid="socialContext"]');
      const isRetweet = !!(socialContext && /reposted|retweet/i.test(socialContext.textContent || ""));

      out.push({
        id,
        handle,
        url: \`https://x.com\${href}\`,
        text: (text || "").slice(0, 800),
        postedAt: ts || Date.now(),
        replies, retweets, likes, bookmarks, views,
        media,
        isRetweet,
      });
    } catch (e) { /* skip */ }
  }
  return JSON.stringify(out.slice(0, 50));
})()
`;

async function scrollDown() {
  await abEval("(()=>{window.scrollBy(0,1600);return 1})()");
  await new Promise(r => setTimeout(r, 2200));
}

// Thorough page scrape: scroll N times, extract on every round, dedup by tweet id.
// User instruction: "كل واحد يمسك موقع ينفضه نفض" — each agent thoroughly scrubs its site.
async function extractFromCurrentPage(rounds = 4) {
  const all = new Map();
  for (let i = 0; i < rounds; i++) {
    try {
      const tweets = await abEval(EXTRACT_TWEETS_JS);
      const arr = Array.isArray(tweets) ? tweets : (typeof tweets === "string" ? JSON.parse(tweets || "[]") : []);
      for (const t of arr) all.set(t.id, t);
      vlog(`  round ${i + 1}/${rounds}: ${arr.length} tweets visible (${all.size} unique so far)`);
    } catch (e) { err("extract err:", e.message); break; }
    if (i < rounds - 1) await scrollDown();
  }
  return [...all.values()];
}

/* ----- Account & query coverage ----- */

async function collectFromHandle(account) {
  try {
    await abOpen(`https://x.com/${account.handle}`);
    const tweets = await extractFromCurrentPage(2);
    log(`@${account.handle}: ${tweets.length} tweets`);
    return tweets.map(t => ({ ...t, sourceHandle: account.handle, sourceWeight: account.weight, sourceTag: account.tag }));
  } catch (e) {
    err(`@${account.handle}:`, e.message);
    return [];
  }
}

async function collectFromQuery(q) {
  try {
    await abOpen(`https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`);
    const tweets = await extractFromCurrentPage(2);
    log(`q="${q}": ${tweets.length} tweets`);
    return tweets.map(t => ({ ...t, sourceQuery: q }));
  } catch (e) {
    err(`q="${q}":`, e.message);
    return [];
  }
}

/* ----- Map raw tweets → ingest items ----- */

function tweetToIngestItem(t) {
  // Tracked-account tweets: 24h window. Search/query tweets: 4h window.
  const handleTtlMs = 24 * 3600 * 1000;
  const queryTtlMs = (CONFIG.x.freshnessWindowMinutes || 240) * 60 * 1000;
  const ttl = t.sourceHandle ? handleTtlMs : queryTtlMs;
  if (t.postedAt < Date.now() - ttl) return null;
  if (t.isRetweet) return null;
  if (!t.text || t.text.length < 6) return null;

  const engagement = (t.likes || 0)
    + (t.retweets || 0) * 2
    + (t.replies || 0) * 1.5
    + (t.bookmarks || 0) * 3;
  // Tracked-account tweets always pass (authority is the signal). Search-discovered
  // tweets need to clear the engagement floor.
  const minEng = CONFIG.x.minLikesForFreshTweet || 30;
  if (engagement < minEng && !t.sourceHandle) return null;

  // Authority weight from tracked-account list, else default for searches.
  const accCfg = CONFIG.x.accounts.find(a => a.handle.toLowerCase() === (t.handle || "").toLowerCase());
  const authority = accCfg?.weight ?? (t.sourceHandle ? (t.sourceWeight || 1.5) : 1.0);

  return {
    source: "x",
    externalId: t.id,
    url: t.url,
    title: t.text.slice(0, 240),
    excerpt: t.text.slice(0, 380),
    author: `@${t.handle}`,
    thumbnail: t.media?.[0] || null,
    category: "tweet",
    engagement,
    authority,
    postedAt: t.postedAt,
    meta: {
      likes: t.likes, retweets: t.retweets, replies: t.replies,
      bookmarks: t.bookmarks, views: t.views,
      sourceHandle: t.sourceHandle, sourceQuery: t.sourceQuery, sourceTag: t.sourceTag,
    },
  };
}

/* ----- Main ----- */

async function postIngest(items) {
  const r = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Radar-Secret": SECRET,
    },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`ingest ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function main() {
  if (!CONFIG.x?.enabled) { log("x disabled in config"); return; }
  if (!SECRET) { err("ALK_RADAR_SECRET not set"); process.exit(2); }

  const t0 = Date.now();
  log(`starting (CDP=:${CDP_PORT} dry=${DRY ? "yes" : "no"})`);

  await abConnect();

  const dedup = new Map();
  for (const acc of CONFIG.x.accounts) {
    const tweets = await collectFromHandle(acc);
    for (const t of tweets) dedup.set(t.id, t);
    await new Promise(r => setTimeout(r, 600));
  }
  for (const q of (CONFIG.x.queries || [])) {
    const tweets = await collectFromQuery(q);
    for (const t of tweets) if (!dedup.has(t.id)) dedup.set(t.id, t);
    await new Promise(r => setTimeout(r, 600));
  }

  const raw = [...dedup.values()];
  const items = raw.map(tweetToIngestItem).filter(Boolean);
  log(`collected ${raw.length} unique tweets → ${items.length} pass freshness/engagement filters`);

  if (DRY) {
    items.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
    for (const it of items.slice(0, 20)) {
      console.log(`  [${it.author}] eng=${it.engagement.toFixed(0)} auth=${it.authority}  ${it.title.slice(0, 80)}`);
    }
    log(`DRY done in ${Date.now() - t0}ms`);
    return;
  }

  if (items.length === 0) { log("nothing to ingest"); return; }
  try {
    const result = await postIngest(items);
    log(`ingest result:`, JSON.stringify(result));
  } catch (e) {
    err("ingest failed:", e.message);
    process.exit(3);
  }
  log(`done in ${Date.now() - t0}ms`);
}

main().catch(e => { err("FATAL", e.stack || e.message); process.exit(1); });
