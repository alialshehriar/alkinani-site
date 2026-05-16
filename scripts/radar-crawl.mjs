#!/usr/bin/env node
// AI Radar — predictive crawl engine.
//
// Sources: Reddit (rising + new), HackerNews (newest + score velocity),
//          GitHub (trending + watched orgs), ProductHunt (RSS), X (codad
//          agent-browser if available, else nitter mirrors).
//
// On each run:
//   1. Collect raw items from every enabled source (parallel).
//   2. Upsert each item into radar_signals; record a snapshot of engagement.
//   3. Compute velocity from successive snapshots (delta engagement / hours).
//   4. Compute composite score: velocity × authority × cross_source × recency.
//   5. Mark items as "breaking" when velocity z-score > breakingThreshold.
//
// Run via cron every 5-10 min on the VPS:
//   */7 * * * * cd /home/alkinani/htdocs/alkinani.live && node scripts/radar-crawl.mjs >> logs/radar.log 2>&1
//
// Env:
//   RADAR_DB           default /home/alkinani/htdocs/alkinani.live/leaderboard.db
//   RADAR_CONFIG       default ./scripts/radar-config.json
//   GITHUB_TOKEN       optional, gives 5000 req/hr (anonymous = 60)
//   RADAR_VERBOSE      "1" for verbose logging
//   RADAR_DRY          "1" — collect & log only, don't write DB
//   RADAR_X_BRIDGE     URL of X scraper (optional). e.g. http://localhost:8745/x
//                      should accept POST { handle, queries } → { tweets: [...] }

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// better-sqlite3 imported lazily so DRY mode works without the dep installed.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.RADAR_DB || path.join(ROOT, "leaderboard.db");
const CONFIG_PATH = process.env.RADAR_CONFIG || path.join(__dirname, "radar-config.json");
const VERBOSE = process.env.RADAR_VERBOSE === "1";
const DRY = process.env.RADAR_DRY === "1";
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

const UA = "alkinani-radar/1.0 (+https://alkinani.live)";

function log(...a) { console.log(new Date().toISOString(), "[radar]", ...a); }
function vlog(...a) { if (VERBOSE) log(...a); }
function err(...a) { console.error(new Date().toISOString(), "[radar][ERR]", ...a); }

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

/* ---------------------------- Fetch helper ---------------------------- */

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "application/json", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 12000),
    method: opts.method || "GET",
    body: opts.body,
  });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function fetchText(url, opts = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 12000),
  });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

/* ----------------------------- Reddit ----------------------------- */

// Reddit OAuth client_credentials flow — datacenter IPs (VPS) are blocked from
// public reddit.com endpoints, but oauth.reddit.com works fine for registered
// "script" apps. Token cached in-memory for 50 min.
let _redditToken = null;
let _redditTokenExpiry = 0;
async function getRedditToken() {
  const cid = process.env.REDDIT_CLIENT_ID;
  const csec = process.env.REDDIT_CLIENT_SECRET;
  if (!cid || !csec) return null;
  if (_redditToken && Date.now() < _redditTokenExpiry) return _redditToken;
  try {
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${cid}:${csec}`).toString("base64"),
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { err("reddit-oauth", await r.text()); return null; }
    const j = await r.json();
    _redditToken = j.access_token;
    _redditTokenExpiry = Date.now() + 50 * 60 * 1000;
    vlog(`reddit OAuth token acquired, expires in ~${j.expires_in}s`);
    return _redditToken;
  } catch (e) { err("reddit-oauth", e.message); return null; }
}

async function collectReddit() {
  if (!config.reddit?.enabled) return [];
  const out = [];
  const subs = config.reddit.subreddits;
  const ttlMs = (config.reddit.freshnessHours || 12) * 3600 * 1000;
  const cutoff = Date.now() - ttlMs;

  const token = await getRedditToken();
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const headers = token
    ? { "Authorization": `Bearer ${token}`, "User-Agent": UA }
    : { "User-Agent": UA };

  for (const sub of subs) {
    for (const endpoint of config.reddit.endpoints) {
      try {
        const url = `${base}/r/${sub.name}/${endpoint}.json?limit=25`;
        const data = await fetchJson(url, { headers });
        const minScore = endpoint === "rising"
          ? config.reddit.minScoreForRising
          : config.reddit.minScoreForNew;
        for (const child of data?.data?.children || []) {
          const d = child.data;
          if (!d || d.stickied || d.over_18) continue;
          const postedAt = (d.created_utc || 0) * 1000;
          if (postedAt < cutoff) continue;
          if ((d.score || 0) < minScore) continue;

          const engagement = (d.score || 0) + (d.num_comments || 0) * 1.5;
          const url_ = d.url_overridden_by_dest || `https://www.reddit.com${d.permalink}`;
          const thumbnail = (d.thumbnail && d.thumbnail.startsWith("http")) ? d.thumbnail
            : (d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&") || null);

          out.push({
            source: "reddit",
            externalId: d.id,
            url: url_,
            title: d.title,
            author: d.author ? `u/${d.author}` : null,
            thumbnail,
            excerpt: (d.selftext || "").slice(0, 280) || null,
            category: endpoint === "rising" ? "discussion" : "discussion",
            engagement,
            authority: sub.weight || 1.5,
            postedAt,
            meta: {
              subreddit: d.subreddit,
              ups: d.score,
              comments: d.num_comments,
              endpoint,
              upvoteRatio: d.upvote_ratio,
              flair: d.link_flair_text,
            },
          });
        }
      } catch (e) {
        err("reddit", sub.name, endpoint, "—", e.message);
      }
    }
  }
  log(`reddit: ${out.length} items`);
  return out;
}

/* ----------------------------- HackerNews ----------------------------- */

async function collectHN() {
  if (!config.hackernews?.enabled) return [];
  const out = [];
  const minPoints = config.hackernews.minPoints || 5;
  const ttlMs = (config.hackernews.freshnessHours || 8) * 3600 * 1000;
  const cutoff = Date.now() - ttlMs;
  const keywords = (config.hackernews.aiKeywords || []).map(k => k.toLowerCase());

  try {
    // Pull both newest and top — newest catches inflection, top catches authority.
    const [newIds, topIds] = await Promise.all([
      fetchJson("https://hacker-news.firebaseio.com/v0/newstories.json"),
      fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json"),
    ]);
    const merged = Array.from(new Set([...newIds.slice(0, 80), ...topIds.slice(0, 60)]));

    // Fetch in batches of 10 to stay polite.
    for (let i = 0; i < merged.length; i += 10) {
      const batch = merged.slice(i, i + 10);
      const items = await Promise.all(batch.map(id =>
        fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)
      ));
      for (const it of items) {
        if (!it || it.deleted || it.dead) continue;
        if (it.type !== "story") continue;
        const postedAt = (it.time || 0) * 1000;
        if (postedAt < cutoff) continue;
        if ((it.score || 0) < minPoints) continue;

        const haystack = `${it.title || ""} ${it.url || ""}`.toLowerCase();
        const hit = keywords.some(k => haystack.includes(k));
        if (!hit) continue;

        const engagement = (it.score || 0) + (it.descendants || 0) * 0.8;
        out.push({
          source: "hackernews",
          externalId: String(it.id),
          url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
          title: it.title || "",
          author: it.by ? `@${it.by}` : null,
          thumbnail: null,
          excerpt: null,
          category: it.title?.toLowerCase().startsWith("show hn") ? "tool"
                  : it.title?.toLowerCase().startsWith("ask hn") ? "discussion"
                  : "news",
          engagement,
          authority: 2.0,
          postedAt,
          meta: {
            hnId: it.id,
            score: it.score,
            descendants: it.descendants,
            commentsUrl: `https://news.ycombinator.com/item?id=${it.id}`,
          },
        });
      }
    }
  } catch (e) {
    err("hn", e.message);
  }
  log(`hackernews: ${out.length} items`);
  return out;
}

/* ----------------------------- GitHub ----------------------------- */

function ghHeaders() {
  const h = { "User-Agent": UA, "Accept": "application/vnd.github+json" };
  if (GH_TOKEN) h["Authorization"] = `Bearer ${GH_TOKEN}`;
  return h;
}

function isoDaysAgo(d) {
  return new Date(Date.now() - d * 86400000).toISOString().split("T")[0];
}

async function collectGitHub() {
  if (!config.github?.enabled) return [];
  const out = [];
  const since = isoDaysAgo(config.github.lookbackDays || 4);

  // 1. Trending search queries
  for (const tpl of config.github.queries) {
    const q = tpl.replace("{since}", since);
    try {
      const data = await fetchJson(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`,
        { headers: ghHeaders(), timeout: 15000 }
      );
      for (const r of data.items || []) {
        const postedAt = new Date(r.created_at).getTime();
        const ageDays = Math.max(0.1, (Date.now() - postedAt) / 86400000);
        const starsPerDay = (r.stargazers_count || 0) / ageDays;
        const engagement = (r.stargazers_count || 0) + (r.forks_count || 0) * 1.5;

        out.push({
          source: "github",
          externalId: r.full_name,
          url: r.html_url,
          title: `${r.full_name} — ${r.description || "no description"}`.slice(0, 240),
          author: r.owner?.login ? `@${r.owner.login}` : null,
          thumbnail: r.owner?.avatar_url || null,
          excerpt: r.description || null,
          category: "tool",
          engagement,
          authority: 1.5,
          postedAt,
          meta: {
            stars: r.stargazers_count,
            forks: r.forks_count,
            language: r.language,
            topics: r.topics || [],
            starsPerDay: Math.round(starsPerDay * 10) / 10,
            license: r.license?.spdx_id || null,
          },
        });
      }
    } catch (e) {
      err("gh-search", q, "—", e.message);
    }
  }

  // 2. Watched orgs — ONLY freshly-created repos. The whole point of watching
  // these orgs is to catch their NEW releases, not their long-running mega-repos
  // (claude-code, llama.cpp, vllm). Use sort=created and filter by created_at
  // age. The discovery filter then drops anything that crosses the popularity
  // line.
  const orgMaxAgeDays = 60;
  for (const org of config.github.watchedOrgs || []) {
    try {
      const repos = await fetchJson(
        `https://api.github.com/orgs/${org}/repos?type=public&sort=created&direction=desc&per_page=15`,
        { headers: ghHeaders(), timeout: 12000 }
      );
      for (const r of repos || []) {
        const createdAt = new Date(r.created_at).getTime();
        if (createdAt < Date.now() - orgMaxAgeDays * 86400000) continue;
        if (r.fork || r.archived) continue;

        const ageDays = Math.max(0.1, (Date.now() - createdAt) / 86400000);
        const starsPerDay = (r.stargazers_count || 0) / ageDays;
        const engagement = (r.stargazers_count || 0) + (r.forks_count || 0) * 1.5;
        out.push({
          source: "github",
          externalId: r.full_name,
          url: r.html_url,
          title: `${r.full_name} — ${r.description || "no description"}`.slice(0, 240),
          author: `@${r.owner.login}`,
          thumbnail: r.owner.avatar_url,
          excerpt: r.description || null,
          category: "tool",
          engagement,
          authority: 2.5, // labs/watched orgs > random search
          postedAt: createdAt, // ← fixed: was pushedAt; now uses creation date
          meta: {
            stars: r.stargazers_count,
            forks: r.forks_count,
            language: r.language,
            topics: r.topics || [],
            watchedOrg: org,
            starsPerDay: Math.round(starsPerDay * 10) / 10,
            license: r.license?.spdx_id || null,
          },
        });
      }
    } catch (e) {
      err("gh-org", org, "—", e.message);
    }
  }

  log(`github: ${out.length} items`);
  return out;
}

/* ----------------------------- Product Hunt ----------------------------- */

async function collectProductHunt() {
  if (!config.producthunt?.enabled) return [];
  const out = [];
  try {
    const xml = await fetchText(config.producthunt.url, { timeout: 12000 });
    const ttlMs = (config.producthunt.freshnessHours || 36) * 3600 * 1000;
    const cutoff = Date.now() - ttlMs;
    // PH uses Atom format. Parse <entry>; tolerate raw <item> too if feed type changes.
    const isAtom = /<feed[\s>]/i.test(xml);
    const splitter = isAtom ? /<entry[\s>]/ : /<item[\s>]/;
    const items = xml.split(splitter).slice(1);
    for (const raw of items) {
      const grab = (tag) => {
        const m = raw.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
        if (!m) return null;
        return m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      };
      const grabAttr = (tag, attr) => {
        const m = raw.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i"));
        return m ? m[1] : null;
      };
      const title = grab("title");
      const link = isAtom ? grabAttr("link", "href") : grab("link");
      const pubDate = isAtom ? (grab("published") || grab("updated")) : grab("pubDate");
      const desc = isAtom ? (grab("content") || grab("summary")) : grab("description");
      if (!title || !link) continue;
      const postedAt = pubDate ? Date.parse(pubDate) : Date.now();
      if (Number.isNaN(postedAt) || postedAt < cutoff) continue;

      // Strip HTML from description.
      const cleanDesc = desc ? desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280) : null;
      // Find image in description if any.
      const imgMatch = desc?.match(/<img[^>]+src=["']([^"']+)["']/i);
      const thumb = imgMatch?.[1] || null;

      out.push({
        source: "producthunt",
        externalId: link,
        url: link,
        title,
        author: null,
        thumbnail: thumb,
        excerpt: cleanDesc,
        category: "tool",
        engagement: 1, // PH RSS doesn't expose votes; will rely on freshness + cross-source
        authority: 1.4,
        postedAt,
        meta: { rss: true },
      });
    }
  } catch (e) {
    err("producthunt", e.message);
  }
  log(`producthunt: ${out.length} items`);
  return out;
}

/* ----------------------------- HuggingFace Spaces ----------------------------- */
// HF Spaces "trending" is the gold "about to blow up" signal for AI tools.
// Public API, no auth needed. We sort by likes_24h to catch acceleration.

async function collectHF() {
  if (!config.huggingface?.enabled) return [];
  const out = [];
  const sortKeys = config.huggingface.sortKeys || ["likes7d", "trendingScore"];
  const ttlMs = (config.huggingface.freshnessHours || 96) * 3600 * 1000;
  const cutoff = Date.now() - ttlMs;

  const minLikes = config.huggingface.minLikes || 3;
  const minTrending = config.huggingface.minTrending || 5;

  for (const sort of sortKeys) {
    try {
      const url = `https://huggingface.co/api/spaces?sort=${encodeURIComponent(sort)}&direction=-1&limit=30&full=true`;
      const data = await fetchJson(url, { timeout: 15000 });
      const items = Array.isArray(data) ? data : (data?.items || []);
      for (const s of items) {
        const lastMod = s.lastModified ? Date.parse(s.lastModified) : 0;
        const created = s.createdAt ? Date.parse(s.createdAt) : lastMod;
        // For trendingScore sort, the score itself is the freshness signal —
        // an old Space with high trending NOW is still hot. We only apply the
        // freshness cutoff to lastModified so stale dead Spaces drop out.
        const postedAt = created || lastMod || Date.now();
        if (lastMod && lastMod < cutoff) continue;

        const likes = s.likes || 0;
        const trending = s.trendingScore || 0;
        // Pass either threshold — trendingScore high means accelerating right now.
        if (likes < minLikes && trending < minTrending) continue;
        const engagement = likes + trending * 10;  // weight trending heavily

        const id = s.id || `${s.author}/${s.id}`;
        const title = s.cardData?.title || s.id || "";
        const desc = s.cardData?.short_description || s.cardData?.description || "";
        const author = s.author || (id.split("/")[0]);
        const sdk = s.sdk;

        out.push({
          source: "huggingface",
          externalId: id,
          url: `https://huggingface.co/spaces/${id}`,
          title: `${id} — ${title || desc || "AI Space"}`.slice(0, 240),
          author: author ? `@${author}` : null,
          thumbnail: s.cardData?.thumbnail || null,
          excerpt: (desc || title || "").slice(0, 380) || null,
          category: "tool",
          engagement,
          authority: 2.0,
          postedAt,
          meta: {
            likes, trending, sdk,
            sort, hardware: s.hardware,
            tags: (s.tags || []).slice(0, 8),
          },
        });
      }
    } catch (e) {
      err("hf-spaces", sort, e.message);
    }
  }
  log(`huggingface: ${out.length} items`);
  return out;
}

/* ----------------------------- X (optional bridge) ----------------------------- */

async function collectX() {
  if (!config.x?.enabled) return [];
  const bridge = process.env.RADAR_X_BRIDGE;
  if (!bridge) {
    vlog("x: no RADAR_X_BRIDGE set, skipping (codad agent-browser not wired)");
    return [];
  }
  const out = [];
  try {
    const accounts = config.x.accounts.map(a => a.handle);
    const queries = config.x.queries || [];
    const data = await fetchJson(bridge, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts, queries, freshnessMinutes: config.x.freshnessWindowMinutes }),
      timeout: 60000,
    });
    const tweets = data?.tweets || [];
    const ttlMs = (config.x.freshnessWindowMinutes || 240) * 60 * 1000;
    const cutoff = Date.now() - ttlMs;
    for (const t of tweets) {
      const postedAt = t.postedAt || Date.now();
      if (postedAt < cutoff) continue;
      const handleWeight = config.x.accounts.find(a => a.handle.toLowerCase() === (t.author || "").toLowerCase())?.weight || 1.2;
      const engagement = (t.likes || 0) + (t.retweets || 0) * 2 + (t.replies || 0) * 1.5 + (t.bookmarks || 0) * 3;
      if (engagement < (config.x.minLikesForFreshTweet || 30) && !t.fromTrackedAccount) continue;
      out.push({
        source: "x",
        externalId: t.id,
        url: t.url || `https://x.com/${t.author}/status/${t.id}`,
        title: t.text?.slice(0, 240) || "",
        author: t.author ? `@${t.author}` : null,
        thumbnail: t.media?.[0] || null,
        excerpt: t.text?.slice(0, 280) || null,
        category: "tweet",
        engagement,
        authority: handleWeight,
        postedAt,
        meta: { likes: t.likes, retweets: t.retweets, replies: t.replies, bookmarks: t.bookmarks },
      });
    }
  } catch (e) {
    err("x bridge", e.message);
  }
  log(`x: ${out.length} items`);
  return out;
}

/* ----------------------------- Discovery filter ----------------------------- */
// Reject items that have already crossed the popularity threshold. The radar's
// whole job is to surface things BEFORE they become trends — already-viral
// items pollute the signal. Configurable per source via radar-config.json.

function applyDiscoveryFilters(items) {
  const cfg = config.discovery;
  if (!cfg?.enabled) return items;
  const blockedRepos = new Set((cfg.blockedRepos || []).map(r => r.toLowerCase()));
  const now = Date.now();
  const kept = [];
  const rejectedReasons = {};

  for (const it of items) {
    const reasons = [];
    const maxEng = cfg.maxAbsoluteEngagement?.[it.source];
    if (maxEng != null && (it.engagement || 0) > maxEng) reasons.push("too-popular");

    const maxAgeDays = cfg.maxAgeDays?.[it.source];
    if (maxAgeDays != null && it.postedAt) {
      const ageDays = (now - it.postedAt) / 86400000;
      if (ageDays > maxAgeDays) reasons.push(`too-old(${ageDays.toFixed(1)}d)`);
    }

    if (it.source === "github") {
      if (blockedRepos.has((it.externalId || "").toLowerCase())) reasons.push("blocked-repo");
      const minGrowth = cfg.minGrowthRate?.github;
      if (minGrowth != null && it.meta?.starsPerDay != null && it.meta.starsPerDay < minGrowth) {
        reasons.push(`slow-growth(${it.meta.starsPerDay}/d)`);
      }
    }
    if (it.source === "huggingface") {
      const minGrowth = cfg.minGrowthRate?.huggingface;
      if (minGrowth != null && it.meta?.likesPerDay != null && it.meta.likesPerDay < minGrowth) {
        reasons.push(`slow-growth(${it.meta.likesPerDay}/d)`);
      }
    }

    if (reasons.length === 0) {
      kept.push(it);
    } else {
      const key = reasons[0];
      rejectedReasons[key] = (rejectedReasons[key] || 0) + 1;
    }
  }
  const summary = Object.entries(rejectedReasons).map(([r, n]) => `${r}=${n}`).join(" ");
  log(`discovery filter: kept ${kept.length}/${items.length} (rejected: ${summary || "none"})`);
  return kept;
}

/* ----------------------------- Cross-source dedup ----------------------------- */

function normalizeUrl(u) {
  if (!u) return "";
  return u.toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[#?].*$/, "")
    .replace(/\/$/, "");
}

function detectCrossSource(items) {
  // Group by normalized URL → multiple sources pointing at same URL means cross-source.
  const byUrl = new Map();
  for (const it of items) {
    const k = normalizeUrl(it.url);
    if (!k) continue;
    if (!byUrl.has(k)) byUrl.set(k, []);
    byUrl.get(k).push(it);
  }
  for (const [, group] of byUrl) {
    if (group.length < 2) continue;
    const sources = new Set(group.map(g => g.source));
    if (sources.size < 2) continue;
    // Boost each item by sources count.
    for (const it of group) it.crossSource = sources.size;
  }
}

/* ----------------------------- DB upsert + scoring ----------------------------- */

async function openDb() {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  // Tables created by server.mjs on boot — but if crawler runs first, recreate
  // the bare minimum here defensively.
  db.exec(`
    CREATE TABLE IF NOT EXISTS radar_signals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source        TEXT NOT NULL,
      external_id   TEXT NOT NULL,
      url           TEXT NOT NULL,
      title         TEXT NOT NULL,
      author        TEXT,
      thumbnail     TEXT,
      body_excerpt  TEXT,
      category      TEXT,
      raw_meta      TEXT,
      engagement    REAL DEFAULT 0,
      velocity      REAL DEFAULT 0,
      authority     REAL DEFAULT 1,
      cross_source  INTEGER DEFAULT 0,
      score         REAL DEFAULT 0,
      breaking      INTEGER DEFAULT 0,
      posted_at     INTEGER,
      first_seen    INTEGER NOT NULL,
      last_updated  INTEGER NOT NULL,
      UNIQUE(source, external_id)
    );
    CREATE TABLE IF NOT EXISTS radar_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id    INTEGER NOT NULL,
      engagement   REAL NOT NULL,
      captured_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_radar_score
      ON radar_signals(score DESC, last_updated DESC);
    CREATE INDEX IF NOT EXISTS idx_radar_snapshots_signal
      ON radar_snapshots(signal_id, captured_at DESC);
  `);
  // Idempotent column adds (safe if columns already exist).
  for (const stmt of [
    "ALTER TABLE radar_signals ADD COLUMN title_ar TEXT",
    "ALTER TABLE radar_signals ADD COLUMN excerpt_ar TEXT",
    "ALTER TABLE radar_signals ADD COLUMN summary_ar TEXT",
    "ALTER TABLE radar_signals ADD COLUMN lang_detected TEXT",
    "ALTER TABLE radar_signals ADD COLUMN translated_at INTEGER",
  ]) { try { db.exec(stmt); } catch { /* exists */ } }
  return db;
}

function upsertAndScore(db, items) {
  const now = Date.now();
  // Discovery-mode scoring: favor growth-rate over absolute count. Items that
  // are ALREADY at high engagement get a NEGATIVE adjustment from
  // absoluteEngagement (weight goes negative in config), forcing the rank to
  // surface emerging items, not already-viral ones.
  const weights = config.scoring?.weights || {
    velocity: 1.5, growthRate: 1.2, novelty: 1.0, authority: 0.6,
    crossSource: 1.4, absoluteEngagement: -0.4,
  };
  const halfLifeMs = (config.scoring?.decayHalfLifeHours || 6) * 3600 * 1000;
  const noveltyHalfLifeMs = (config.scoring?.noveltyHalfLifeHours || 12) * 3600 * 1000;
  const breakingThreshold = config.scoring?.breakingThreshold ?? 1.5;
  const authorityCap = config.scoring?.authorityCap ?? 2.5;

  function computeGrowthRate(it) {
    // GitHub: stars per day since creation. HF: likes per day. Others: 0.
    if (it.source === "github" && it.meta?.starsPerDay != null) return it.meta.starsPerDay;
    if (it.source === "huggingface" && it.meta?.likesPerDay != null) return it.meta.likesPerDay;
    if (it.postedAt) {
      const ageDays = Math.max(0.1, (now - it.postedAt) / 86400000);
      return (it.engagement || 0) / ageDays;
    }
    return 0;
  }

  function discoveryScore({ velocity, authority, crossSource, postedAt, engagement, growthRate }) {
    const noveltyAge = (now - (postedAt || now)) / noveltyHalfLifeMs;
    const novelty = Math.max(0.05, Math.exp(-noveltyAge * Math.LN2));
    const cappedAuthority = Math.min(authority || 1, authorityCap);
    const crossBoost = 1 + (crossSource ? (crossSource - 1) * 0.6 : 0);
    return (
      weights.velocity      * Math.log10(1 + velocity * 60) * 4        // /min → /hour boost
      + weights.growthRate  * Math.log10(1 + growthRate)
      + weights.novelty     * novelty * 5
      + weights.authority   * cappedAuthority
      + weights.crossSource * crossBoost
      + weights.absoluteEngagement * Math.log10(1 + engagement)
    );
  }

  const findStmt = db.prepare("SELECT id, engagement, first_seen FROM radar_signals WHERE source = ? AND external_id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO radar_signals
      (source, external_id, url, title, author, thumbnail, body_excerpt, category,
       raw_meta, engagement, velocity, authority, cross_source, score, breaking,
       posted_at, first_seen, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE radar_signals
    SET engagement = ?, velocity = ?, authority = ?, cross_source = ?,
        score = ?, breaking = ?, raw_meta = ?, thumbnail = COALESCE(?, thumbnail),
        body_excerpt = COALESCE(?, body_excerpt), last_updated = ?
    WHERE id = ?
  `);
  const snapshotStmt = db.prepare("INSERT INTO radar_snapshots (signal_id, engagement, captured_at) VALUES (?, ?, ?)");
  const recentSnapshotStmt = db.prepare(
    "SELECT engagement, captured_at FROM radar_snapshots WHERE signal_id = ? AND captured_at > ? ORDER BY captured_at ASC LIMIT 1"
  );

  // Compute per-source velocity baseline (median) for z-score-ish breaking flag.
  const velocitiesBySource = {};

  const tx = db.transaction((items) => {
    for (const it of items) {
      let row = findStmt.get(it.source, it.externalId);
      let signalId, firstSeen, prevEng;

      if (!row) {
        // First-time seen — velocity unknown, score from growth-rate + novelty.
        const initialScore = discoveryScore({
          velocity: 0,
          authority: it.authority || 1,
          crossSource: it.crossSource || 0,
          postedAt: it.postedAt,
          engagement: it.engagement || 0,
          growthRate: computeGrowthRate(it),
        });
        const info = insertStmt.run(
          it.source, it.externalId, it.url, it.title || "(no title)", it.author || null,
          it.thumbnail || null, it.excerpt || null, it.category || null,
          JSON.stringify(it.meta || {}),
          it.engagement || 0, 0, it.authority || 1, it.crossSource || 0,
          initialScore, 0, it.postedAt || null, now, now
        );
        signalId = info.lastInsertRowid;
        firstSeen = now;
        prevEng = 0;
      } else {
        signalId = row.id;
        firstSeen = row.first_seen;
        prevEng = row.engagement || 0;
      }

      snapshotStmt.run(signalId, it.engagement || 0, now);

      // Velocity = engagement delta vs. earliest snapshot in last 60 min.
      // Falls back to first_seen if no recent snapshot exists.
      const earliestRecent = recentSnapshotStmt.get(signalId, now - 60 * 60 * 1000);
      let velocity = 0;
      if (earliestRecent && earliestRecent.captured_at < now) {
        const dtMin = (now - earliestRecent.captured_at) / 60000;
        if (dtMin > 0.5) velocity = ((it.engagement || 0) - earliestRecent.engagement) / dtMin;
      } else if (firstSeen < now - 60000) {
        const dtMin = (now - firstSeen) / 60000;
        if (dtMin > 1) velocity = ((it.engagement || 0) - prevEng) / dtMin;
      }
      velocity = Math.max(0, velocity);
      (velocitiesBySource[it.source] ||= []).push(velocity);

      // Discovery-mode score: prefers growth-rate + velocity + novelty.
      // absoluteEngagement weight is NEGATIVE in config — already-large items
      // get a penalty, not a bonus. This is what makes us a discovery engine.
      const score = discoveryScore({
        velocity,
        authority: it.authority || 1,
        crossSource: it.crossSource || 0,
        postedAt: it.postedAt || firstSeen,
        engagement: it.engagement || 0,
        growthRate: computeGrowthRate(it),
      });

      // Breaking flag set in second pass once we have per-source baselines.
      if (row) {
        updateStmt.run(
          it.engagement || 0, velocity, it.authority || 1, it.crossSource || 0,
          score, 0, JSON.stringify(it.meta || {}),
          it.thumbnail || null, it.excerpt || null, now, signalId
        );
      } else {
        // first-time row already inserted; rewrite velocity + score now that we have it
        updateStmt.run(
          it.engagement || 0, velocity, it.authority || 1, it.crossSource || 0,
          score, 0, JSON.stringify(it.meta || {}),
          it.thumbnail || null, it.excerpt || null, now, signalId
        );
      }
    }
  });

  tx(items);

  // 2nd pass: mark breaking based on per-source velocity z-score.
  const breakingStmt = db.prepare("UPDATE radar_signals SET breaking = ? WHERE source = ? AND velocity >= ?");
  for (const [src, vels] of Object.entries(velocitiesBySource)) {
    if (vels.length < 4) continue;
    const sorted = [...vels].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const cutoff = Math.max(median * (1 + breakingThreshold), p90, 0.001);
    db.prepare("UPDATE radar_signals SET breaking = 0 WHERE source = ?").run(src);
    breakingStmt.run(1, src, cutoff);
  }

  // Prune snapshots older than 24h to keep DB lean.
  db.prepare("DELETE FROM radar_snapshots WHERE captured_at < ?").run(now - 24 * 3600 * 1000);
}

/* ----------------------------- Main ----------------------------- */

async function main() {
  const t0 = Date.now();
  log(`crawl starting (db=${DB_PATH}${DRY ? " DRY" : ""}${GH_TOKEN ? " gh-token" : " gh-anon"})`);

  const buckets = await Promise.allSettled([
    collectReddit(),
    collectHN(),
    collectGitHub(),
    collectProductHunt(),
    collectHF(),
    collectX(),
  ]);

  let items = [];
  for (const b of buckets) {
    if (b.status === "fulfilled") items.push(...b.value);
    else err("bucket rejected:", b.reason?.message || b.reason);
  }

  // Discovery filter — reject already-viral items BEFORE scoring + ingest.
  items = applyDiscoveryFilters(items);

  detectCrossSource(items);
  log(`collected ${items.length} items (cross=${items.filter(i => i.crossSource).length})`);

  if (DRY) {
    items.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
    for (const it of items.slice(0, 20)) {
      console.log(`  [${it.source}] eng=${(it.engagement || 0).toFixed(0)} auth=${it.authority} cross=${it.crossSource || 0}  ${it.title.slice(0, 80)}`);
    }
    log(`DRY done in ${Date.now() - t0}ms`);
    return;
  }

  const db = await openDb();
  upsertAndScore(db, items);

  const top = db.prepare(
    "SELECT source, title, score, velocity, breaking FROM radar_signals WHERE last_updated > ? ORDER BY score DESC LIMIT 20"
  ).all(Date.now() - 24 * 3600 * 1000);

  log(`top ${top.length} after scoring:`);
  for (const r of top) {
    console.log(`  ${r.breaking ? "🔥" : "  "} [${r.source}] score=${r.score.toFixed(2)} vel=${r.velocity.toFixed(2)}/min  ${r.title.slice(0, 90)}`);
  }
  db.close();

  log(`done in ${Date.now() - t0}ms — ${items.length} items processed`);
}

main().catch(e => {
  err("FATAL", e.stack || e.message);
  process.exit(1);
});
