# Turjuman (ترجمان) — Design Specification

**Date**: 2026-05-08
**Author**: Ali Alkinani
**Status**: Brainstorm → Plan
**Site**: alkinani.live

---

## 1. Vision

A high-quality video translation tool. The user pastes a link or uploads a video, gets back context-aware subtitles in their target language. Lives at **`turjuman.alkinani.live`** (own subdomain, own stack) with a discoverable card on `alkinani.live/tools` (the parent site's Tools hub).

**Strategic posture**: Turjuman is a **marketing surface for Ali's brand**, not a standalone product bet. It draws attention to `alkinani.live`, generates word-of-mouth in Saudi creator circles, and stays scope-disciplined so it does not absorb the calendar. The primary product effort remains Codad. Turjuman gets a hard cap of ~2 hours/week of Ali's curation time post-launch.

**Phase 1 quality bar**: context-aware subtitles measurably better than YouTube auto-translate or single-shot Whisper for Arabic dialects, with Netflix/BBC formatting standards.

**Phase 2 quality bar** ("quality polish"): subtitles that preserve story context, speaker identity, entity consistency, idioms, and cultural nuance via the full 6-tier CPL. The "competes with human translation" claim is reserved for Phase 2 and is gated on blind comparison fixtures (5 dialect samples vs. 3 named competitors) producing measurable preference.

**Business model**: 10 free minutes per month, then paid credit packs (1 credit = 1 minute) in SAR. Per-minute pricing keeps margin stable regardless of user video-length distribution — see Section 8.3 for sensitivity analysis.

---

## 2. Scope (v1)

**In scope (Phase 1 MVP)**:
- **Own subdomain `turjuman.alkinani.live`** (own Cloudflare Pages project, own Worker, own D1, own R2 bucket)
- Tools collection page at `alkinani.live/tools` with a card linking out to `turjuman.alkinani.live`. The parent site keeps its existing VPS proxy untouched. No `/api/turjuman/*` collision.
- (Optional) `alkinani.live/turjuman` redirect to the subdomain for short-link sharing
- Source: any video link (1900+ sites via yt-dlp, with Cobalt fallback) OR direct file upload
- Auto-detect source language; user picks target language
- Output: interactive player + burned-in MP4 + SRT + VTT
- **CPL tiers 1, 4, 5 only in Phase 1.** Tiers 2 (story summary), 3 (entity ledger), 6 (glossary) ship in Phase 2 as the "quality polish" milestone.
- Hybrid model stack (Gemini 2.5 Pro for short videos, ElevenLabs Scribe + Claude Sonnet 4.6 for longer)
- Magic Link auth (email only, no passwords) — single-use 15-min token, HttpOnly+Secure session cookie, 30-day session with sliding extension
- Lemon Squeezy payments, credit-pack model in SAR — webhook HMAC signature verification required
- **2 paid tiers + free tier in Phase 1**: Starter, Pro. Studio Pack is **gated on Phase 2** (full CPL + edit loop) — selling Studio in Phase 1 invites refund spike when buyers experience the partial-CPL product.
- Credits expire after 6 months
- **Per-minute credit unit** (1 credit = 1 minute of video). No partial-credit rounding; clean math.

**Out of scope (deferred to later phases)**:
- Telegram bot (Phase 3)
- Subscription model (only one-off credit packs in v1)
- Cookie/session injection for login-walled content (deferred until standalone security design completes)
- Self-hosted local model option (free tier with watermark)
- Fine-tuning ElevenLabs Scribe or Whisper on dialect data (Phase 4)
- Speaker voice cloning / dubbing
- White-label / enterprise tier (separate spec; not in this document's scope)

---

## 3. Architecture

### 3.1 Component Map

```
┌──────────────────────────────────────────────────────────────┐
│  Parent site: alkinani.live (untouched architecture)         │
│   /                          existing landing                │
│   /tools                     new card grid → links out       │
│       └─ Turjuman card → https://turjuman.alkinani.live      │
│       └─ Radar card    → existing /#radar                    │
│  Optional /turjuman redirect → turjuman.alkinani.live        │
└──────────────────────────────────────────────────────────────┘
                       │ DNS CNAME
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Turjuman App (Vite + React 19 + Tailwind 4)                 │
│  turjuman.alkinani.live — own Cloudflare Pages project       │
│                                                              │
│  Routes (all on subdomain):                                  │
│   /                          landing + drop zone             │
│   /jobs/:id                  result + interactive player     │
│   /pricing                   tier comparison                 │
│   /login                     magic link entry                │
│   /api/*                     Worker endpoints (no collision  │
│                              with parent site's catch-all)   │
└──────────────────────┬───────────────────────────────────────┘
                       │ POST /api/turjuman/jobs
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Worker  (functions/turjuman/*)                   │
│                                                              │
│  Responsibilities:                                           │
│   • Auth (magic link via Resend)                             │
│   • Quota check (free 2/mo or paid credits)                  │
│   • Accept link or pre-signed R2 upload                      │
│   • Push job to Cloudflare Queue                             │
│   • Return job_id; stream progress via WebSocket             │
│                                                              │
│  Storage:                                                    │
│   • R2 bucket: source videos + output MP4 + SRT/VTT         │
│   • D1 database: users, jobs, credits, transcripts          │
└──────────────────────┬───────────────────────────────────────┘
                       │ pull job
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Pipeline Worker (Hetzner CPX41, Python 3.11)                │
│  4 vCPU AMD / 8 GB RAM / no GPU / €24/month                  │
│                                                              │
│  Pipeline (orchestrated, not agentic) — Phase 1 simplified: │
│    1. yt-dlp / Cobalt fallback   → video.mp4                 │
│    2. ffmpeg                      → audio.wav                 │
│       (Demucs + pyannote dropped from Phase 1 —              │
│        re-evaluate in Phase 2 if quality data demands it)    │
│    3. Silero VAD                  → speech_segments           │
│    4. Router decides:                                        │
│         video < 5 min?                                       │
│           → Gemini 2.5 Pro multimodal (single call)          │
│             with CPL tiers 1+5 injected as system prompt    │
│         else:                                                │
│           → ElevenLabs Scribe + Claude (Phase-1 CPL:        │
│             tiers 1, 4, 5 — tiers 2/3/6 in Phase 2)         │
│    5. SRT formatter (Netflix/BBC standards)                  │
│    6. ffmpeg burn → final.mp4                                │
│    7. Upload outputs → R2                                    │
│    8. Progress posted to Worker via HTTP+HMAC; Worker        │
│       relays to client via SSE (WebSocket fallback)          │
└──────────────────────┬───────────────────────────────────────┘
                       │ result available
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Interactive Player (React component on alkinani.live)       │
│                                                              │
│   • <video> with embedded VTT                                │
│   • Right rail: clickable timestamped lines                  │
│   • Inline editor for any line                               │
│   • Confidence badges (green/yellow)                         │
│   • Download buttons (MP4 / SRT / VTT)                       │
│   • Share link (R2 public URL, 30-day TTL)                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Component Boundaries

Each component has one purpose, communicates over a stable interface, can be tested independently.

| Component | Purpose | Inputs | Outputs |
|---|---|---|---|
| Web App | UI rendering and user interactions | URL params, user typing | HTTP requests to Worker |
| Worker | Routing, auth, quota, job dispatch | HTTP requests, queue messages | Queue jobs, R2 writes, D1 writes |
| Pipeline Worker | Video processing, ASR, translation, burning | Queue messages, R2 reads | R2 writes (outputs), pubsub progress |
| Player | Display and edit translations | VTT + SRT URLs from R2, transcript JSON from D1 | User edits → POST to Worker |

---

## 4. Quality Engine: 6-Layer Context Preservation (CPL)

The competitive moat. For every line being translated, the translator receives:

| Tier | Layer | Source | Refresh |
|---|---|---|---|
| 1 | **Video metadata** — title, channel, domain, dialect | yt-dlp + classifier | Once at start |
| 2 | **Story summary** — rolling 200-word summary of video so far | Claude Haiku 4.6 | Every 30 seconds of video |
| 3 | **Entity ledger** — locked translations for names, products, places | spaCy + cumulative DB | Updated as new entities appear |
| 4 | **Visual context** — what's on screen + OCR of any visible text | Gemini 2.5 Flash | Every 30 seconds |
| 5 | **Local window** — 10 previous lines (translated) + current + 5 next (raw) | Pipeline state | Every line |
| 6 | **Glossary hits** — idioms, proverbs, technical terms matched in current line | Pre-built database (~500 idioms at launch) | Per-line lookup |

**Post-translation passes** (run on full transcript):

- **Back-translation drift check**: target → source → diff. If drift > 20%, re-translate that segment with stricter prompt.
- **Discourse smoother**: single Claude pass on full SRT to enforce pronoun, tense, and entity consistency.
- **Subtitle formatter**: Netflix/BBC standards (max 42 Latin / 22 Arabic chars per line, max 2 lines, ≥1.2s display, syntax-aware line breaks).

---

## 5. Source Acquisition Strategy

Three-tier extraction in v1. Worker MUST validate every submitted URL: scheme allowlist (`https://` only), DNS-resolve, reject RFC-1918 / loopback / link-local / multicast IPs (SSRF protection) **before** dispatching to the pipeline.

| Tier | Tool | Coverage |
|---|---|---|
| 1 | `yt-dlp` (auto-updated daily) | 1900+ sites: YouTube, TikTok, IG, X, LinkedIn, Reddit, Vimeo, etc. |
| 2 | Cobalt API | Captures TikTok/IG that yt-dlp misses |
| 3 | Direct file upload (always available) | Login-walled or unsupported content — user safety net |

**Login-walled content** (private videos requiring auth): user is told `هذا الفيديو يحتاج تسجيل دخول — حمّله وارفعه مباشرة.` (Tier 3 upload). Cookie/session injection is **explicitly deferred** until a dedicated credential-handling security design is completed and reviewed.

**DRM-protected streams** (Netflix, Shahid, Disney+) are out of scope. Metadata probe blocks known DRM platforms; uploaded copies of DRM content remain out-of-scope per ToS (legal mitigation only — no technical enforcement at upload).

---

## 6. User Experience

### 6.1 Tools Hub (`/tools`)

Reuses the visual pattern from existing `PlayLab` / `TechSprint` components. Two cards for v1: "Turjuman" and "Radar". Switcher animates between them; URL updates without full reload.

### 6.2 Turjuman Page

**Empty state**:

```
                     ترجمان
       ترجمة فيديو احترافية، تحترم السياق

  ┌──────────────────────────────────────────────┐
  │  اسحب فيديو هنا  أو  الصق رابط               │
  │                                              │
  │  ▶ يدعم: YouTube · TikTok · X · IG · LinkedIn│
  │     + 1,900 موقع آخر                        │
  └──────────────────────────────────────────────┘

  لغة المصدر:  🪄 اكتشاف تلقائي
  لغة الترجمة: [عربي ▼]   (٤٥ لغة)

              [ ابدأ الترجمة ]

  لديك ٢ من ٢ تجارب مجانية هذا الشهر.
```

**Processing state**: real-time progress with stage indicators and ETA (powered by WebSocket).

**Result state**: interactive player (Section 6.3).

### 6.3 Interactive Player

Full player capabilities (target end state):

- `<video>` element with native HTML5 captions from VTT
- Right rail: scrollable list of timestamped subtitle lines, current line highlighted, click to seek
- Each line has an edit (✏) button → opens inline textarea, save updates SRT + regenerates burned MP4 in background *(Phase 2)*
- Lines with low translator confidence (<80%) shown with a yellow indicator and a tooltip ("الموديل غير واثق — راجع") *(Phase 2)*
- Subtitle styling controls: size, position, color *(Phase 2; Phase 1 ships sensible defaults — white text, bottom center, 90% opacity, white outline 2px)*
- Three downloads: MP4 (burned), SRT, VTT
- "Share" button copies an **auth-required short-lived signed URL** (15-min validity, regenerated on demand). Public unauthenticated 30-day URLs were dropped due to copyright/bandwidth liability.
- **Right-rail `dir` attribute** tracks the **target language** of the job (not the UI language). Each subtitle cue sets its own `dir` per language. Inline editor textarea matches target language direction.

**Phase 1 player** has only the read-only view: video, right-rail navigation, downloads, and share. Inline editing, confidence indicators, and styling controls arrive in Phase 2.

**Mobile**: drop zone collapses to a tap-to-upload affordance; right rail moves below the video as a collapsible sheet; touch targets are ≥44pt.

**Error states** (each gets explicit visual treatment):

| State | UI |
|---|---|
| Player loading (R2 fetch) | Skeleton right-rail + buffering video poster |
| Player error (R2 expired/burn failed) | Inline error card with "Re-download SRT" fallback button |
| Source unreachable | Inline error card replaces processing UI; CTA "Upload file instead" |
| Pipeline error (any pipeline crash) | Inline error card; CTA "Retry" (auto-retry already attempted once); credit refund visible |
| Out of credits mid-flow | Modal with pack options; partially uploaded file kept on R2 with 1-hour grace period to complete purchase |

### 6.4 User Edits → Learning Loop

Every user edit is logged to D1 as `(original_text, corrected_text, video_metadata, timestamp)`. After 1,000+ corrections, this becomes a fine-tuning dataset for a future custom model.

---

## 7. Subtitle Formatting Standards

Enforced by a dedicated formatter step (after translation, before burning):

| Rule | Value |
|---|---|
| Max characters per line | 42 (Latin) / 22 (Arabic) |
| Max lines per cue | 2 |
| Min display duration | 1.2s |
| Max display duration | 7s |
| Reading speed limit | 17 chars/sec (Arabic), 20 (English) |
| Min gap between cues | 80ms (≥2 frames at 24fps) |
| Forbidden line breaks | Inside `جار+مجرور`, `مضاف+إليه`, prepositions |
| Punctuation | Locale-correct (Arabic uses ، and ؛, English uses , and ;) |
| Numbers | Auto-converted to target locale (٢٠٢٦ ⇄ 2026) |
| Music / non-speech | Marked with ♪ symbol or `(ضحك)` annotations |

---

## 8. Pricing & Credit System

### 8.1 Credit Definition

**1 credit = 1 minute of video.** No partial-credit rounding, no "up to" sticker shock. A 12-minute video costs 12 credits. A 30-minute video costs 30 credits. The user always knows the math.

### 8.2 Tiers (Phase 1)

| Tier | Price | Credits (= minutes) | Effective per-minute | Margin (avg-stack) |
|---|---|---|---|---|
| Free | 0 SAR | 10 / month | — | — |
| Starter | **14 SAR** | 50 | 0.28 SAR/min | ~62% |
| Pro | **49 SAR** | 200 | 0.245 SAR/min | ~57% |

**Studio Pack (750 min for 149 SAR; ~47% margin)** is **deferred to Phase 2** and unlocks only when the full CPL pipeline ships. Selling Studio in Phase 1 was an inverted-incentive risk: high-volume buyers experiencing the partial-CPL output is the worst possible early-customer cohort.

### 8.3 Cost Sensitivity (per minute, average user video-length distribution)

Phase 1 cost scales linearly with duration:

| Cost item | $/min | SAR/min |
|---|---|---|
| ASR (Scribe avg, or Gemini for short path) | $0.0067 | 0.025 |
| Translation + critique (Claude Sonnet 4.6) | $0.020 | 0.075 |
| Visual context + summary (Gemini Flash + Haiku) | $0.006 | 0.022 |
| R2 + bandwidth | $0.001 | 0.004 |
| Server (Hetzner CPX41 amortized over ~120 min/day) | $0.002 | 0.008 |
| **Total cost per minute (long path)** | **~$0.036** | **~0.13 SAR** |
| Total cost per minute (short path) | ~$0.014 | 0.053 SAR |

**Margin sensitivity table** (Pro pack at 0.245 SAR/min effective price):

| Avg user video length | Path | Cost/min | Margin |
|---|---|---|---|
| ≤5 min | short (Gemini multi) | 0.053 | **78%** |
| 5–15 min | long (Scribe+Claude) | 0.13 | **47%** |
| 15–30 min | long | 0.13 | **47%** |

Cost per minute is independent of video length on the long path — so margin stays stable regardless of how power users behave. **The 90-min Studio Pack disaster is mathematically prevented by per-minute pricing.**

### 8.3 Credit Lifecycle

- Credits expire **6 months** from purchase.
- Free credits reset on the 1st of each calendar month.
- Free credits do not stack (max 2 at any time).
- **Refund policy** — written precisely to prevent abuse:
  - **Pack with 0 credits consumed**: full refund within 14 days, automated.
  - **Pack with credits consumed**: pro-rata refund of unused credits at the per-credit price (e.g., Pro Pack 49 SAR / 200 = 0.245 SAR per credit), within 7 days of purchase only.
  - **No refund** after 30 days regardless of credit balance.
  - Accounts flagged for >1 refund go to manual review queue.
  - Chargebacks tracked separately; >1% chargeback rate is an account-level emergency (Lemon Squeezy fraud signals monitored).

### 8.4 Per-Minute Cost Validation

Cost numbers in 8.3 are conservative. Pre-launch validation gate (Section 17 risk row): run 5-minute Najdi/Hijazi fixtures through the pipeline, measure actual API spend per minute, confirm within ±20% of the table above before locking pricing into Lemon Squeezy.

---

## 9. Authentication & Identity

### 9.1 Auth Method

**Magic Link Email only.** No passwords, no social login (in v1).

- User enters email → Worker generates **single-use token, 15-minute TTL** → email sent via Resend → link redeems token (deleted from KV on first use) → server sets **HttpOnly + Secure + SameSite=Lax** session cookie
- Session: 30-day max with sliding 7-day extension on use; absolute hard cap 90 days; `/api/logout` endpoint deletes the KV session immediately
- **Anti-Sybil**: per-IP rate limit on magic-link requests (5/hour), constant-time token comparison, disposable-email-domain blocklist (mailinator, tempmail, etc.), free-tier quota tracked by `email + IP /24` to make multi-account abuse expensive
- Resend requires SPF/DKIM/DMARC on `alkinani.live` (DNS prerequisite, not optional)

### 9.2 Account Model (D1)

```sql
users (
  id TEXT PRIMARY KEY,            -- nanoid
  email TEXT UNIQUE NOT NULL,
  credits_balance INTEGER DEFAULT 0,
  free_credits_remaining INTEGER DEFAULT 2,
  free_credits_reset_at TEXT,
  created_at TEXT,
  last_active_at TEXT
)

credits_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  delta INTEGER NOT NULL,         -- positive for purchase, negative for use
  reason TEXT,                    -- 'starter_pack' | 'job:abc123' | 'free_grant' | 'refund'
  expires_at TEXT,                -- 6 months from purchase (NULL for usage rows)
  lemon_order_id TEXT UNIQUE,     -- idempotency key for webhook processing
  refunded_at TEXT,               -- timestamp when this row was refunded (NULL if not)
  refund_amount_sar REAL,         -- pro-rata refund amount
  created_at TEXT
)

jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  source_kind TEXT,               -- 'url' | 'upload'
  source_ref TEXT,                -- URL or R2 key
  source_lang TEXT,               -- detected
  target_lang TEXT,               -- user-selected
  duration_seconds INTEGER,
  credits_charged INTEGER,
  status TEXT,                    -- 'queued' | 'processing' | 'done' | 'error'
  error_message TEXT,
  output_mp4_key TEXT,            -- R2 key
  output_srt_key TEXT,
  output_vtt_key TEXT,
  share_token TEXT,               -- public share URL
  created_at TEXT,
  completed_at TEXT
)

corrections (
  id TEXT PRIMARY KEY,
  job_id TEXT,                    -- not enforced FK; job may be deleted at 30 days
  user_id TEXT,                   -- nullable for anonymized rows
  cue_index INTEGER,
  original_text TEXT,
  corrected_text TEXT,
  source_lang TEXT,
  target_lang TEXT,
  created_at TEXT,
  anonymized_at TEXT              -- set 30 days after job; clears user_id+job_id
)
```

---

## 10. Payments

### 10.1 Provider

**Lemon Squeezy** (already integrated with codad.co; reuse infrastructure).

### 10.2 Flow

1. User clicks "Buy Starter Pack" → Worker creates Lemon Squeezy checkout session → redirect
2. Lemon Squeezy hosts payment. **Mada support must be verified with a live ~14 SAR test transaction before launch.** Risk register flags this — Moyasar fallback wired in v1, not deferred.
3. On success, Lemon Squeezy webhook → Worker:
   - **MANDATORY**: verify `X-Signature` HMAC-SHA256 against the webhook secret stored in CF Worker secret (via `wrangler secret put`)
   - Reject if request timestamp is older than 5 minutes (replay protection)
   - Look up `order_id` in `credits_log.lemon_order_id` (new column) — if exists, no-op (idempotency)
   - Otherwise insert credit row with `expires_at = now + 6 months` and `lemon_order_id` set
4. Webhook handlers also process `order_refunded` events: locate the original order via `lemon_order_id`, mark it `refunded`, deduct unconsumed credits.
5. User redirected back to `turjuman.alkinani.live` with a success toast — credit balance visibly updated; "credits applying..." spinner shown if webhook hasn't fired within 3s of redirect.

### 10.3 Products in Lemon Squeezy Dashboard

Phase 1 SKUs:
- `Turjuman Starter Pack` — 14 SAR — grants **50 credits (= 50 minutes)**
- `Turjuman Pro Pack` — 49 SAR — grants **200 credits (= 200 minutes)**

Phase 2 (gated on full CPL ship):
- `Turjuman Studio Pack` — 149 SAR — grants **750 credits (= 750 minutes)**

Each product's webhook body identifies which pack via SKU. Webhook handler is idempotent (see Section 10.2 + `lemon_order_id` column).

---

## 11. Error Handling

| Failure mode | User experience | System action |
|---|---|---|
| Source URL unreachable after all 4 tiers | Friendly error: "تعذّر الوصول للفيديو. حاول رفع الملف مباشرة." | Job marked errored, credit not deducted |
| Source DRM-protected | "هذا الفيديو محمي ولا يمكن ترجمته." | Job rejected before queuing, no credit deducted |
| Pipeline worker crash mid-job | Auto-retry once after 60s; if second attempt fails, refund credit and log | Slack/Telegram alert to Ali |
| Translation drift exceeds threshold | User sees yellow ⚠ indicators on affected lines; everything still saves | Drift logged for analysis |
| Lemon Squeezy webhook lost | Idempotent retry by Lemon (handled via order ID dedup in D1) | No double-credit |
| User runs out of credits mid-upload | Block at upload step before consuming | Show pack upgrade modal |
| File upload exceeds 2 GB | Block at presign step; show clear limit message | — |
| Video > 90 minutes | Block at metadata probe; recommend splitting | — |

---

## 12. Limits & Constraints

| Limit | Value | Reason |
|---|---|---|
| Max video length | **30 minutes in Phase 1** (raised to 90 in Phase 2 only after cost economics validated) | Cost control + quality consistency |
| Max upload size | 1 GB Phase 1 (2 GB once R2 multipart upload state machine ships) | R2 + Worker request limits |
| Max concurrent jobs per user | 2 | Fair queue per-user |
| Max global concurrent jobs | 6 (CPX41 capacity ceiling) | Hardware bound; queue depth visible to user |
| Job retention | 30 days (auto-deletes source MP4, output MP4, SRT, VTT, transcript JSON) | Storage cost + DMCA hygiene |
| Corrections retention | 30 days raw → anonymized indefinitely (user_id+job_id stripped, language-pair text only) | PDPL data minimization |
| Free credits per month | **10 minutes/month**, gated by `email + IP/24` quota | Real product trial without abuse |
| Magic-link rate limit | 5 emails / IP / hour | Anti-Sybil |
| Supported source languages | 99 (Scribe-supported) | — |
| Supported target languages | **3 in Phase 1: Arabic, English, Spanish.** Expanded once demand justifies. | Concentrate quality investment |

---

## 13. Telemetry

Logged to D1 (or a separate analytics table):
- Job duration breakdown by stage
- Per-line confidence distribution
- User correction rate per language pair (signal of model quality)
- Source acquisition success rate per platform (yt-dlp tier hit-rate)
- Cost per job (actual API usage)
- Credit churn rate (purchase → usage timing)

Used to: detect quality regressions, identify which platforms need fallback improvements, and decide pricing changes.

---

## 14. Testing Strategy

| Layer | Test type | What's covered |
|---|---|---|
| Subtitle formatter | Unit (golden files) | Line break rules, char limits, punctuation |
| CPL components | Unit | Each tier's input/output contract |
| Pipeline orchestrator | Integration | End-to-end on 5 fixture videos (different durations, languages, dialects) |
| Worker endpoints | Integration | Auth, quota, payment webhook |
| Player UI | Component (Vitest + Testing Library) | Rendering, edit flow, downloads |
| Smoke (post-deploy) | E2E (Playwright) | Upload short clip → full job → download → assert SRT exists |

Fixture videos: 1-min English tech, 5-min Najdi vlog, 10-min Egyptian comedy, 30-min Levantine podcast, 1-hour conference talk.

---

## 15. Phasing

### Phase 1 — MVP (target: **4 weeks**)

- Subdomain `turjuman.alkinani.live` provisioned (Cloudflare Pages project, DNS, TLS)
- Card on `alkinani.live/tools` linking to the subdomain (parent site nav gets a new `/tools` entry)
- Turjuman landing with link/upload UI (mobile-aware drop zone)
- Magic Link auth + anti-Sybil controls (Section 9.1)
- Hybrid pipeline on Hetzner CPX41 (no Demucs, no pyannote in Phase 1), CPL tiers 1, 4, 5 only
- Subtitle formatter (Netflix-grade)
- Interactive player with view + download (no inline edit yet)
- Lemon Squeezy integration with **Starter + Pro packs only** + Moyasar fallback wired
- Free 10-min/month enforcement (per-minute, per email+IP/24 quota)
- Pre-launch fixture benchmark: Scribe vs Whisper-large-v3 vs Gemini on 5 dialect samples (risk gate — must pass before lock-in)
- Live mada test transaction on Lemon Squeezy (risk gate)
- DMCA agent registered + `/dmca` takedown endpoint live

**Definition of done**:
1. A stranger lands on `turjuman.alkinani.live`, signs up, pastes a YouTube link, gets a downloadable MP4 with quality subtitles in under 10 minutes for a 5-minute video, on the free tier.
2. CPX41 benchmark passes on 5/10/30-min Najdi/Hijazi fixtures: end-to-end latency ≤ 2× video duration on long path, ≤ 1× on short path.
3. Mada test purchase succeeds via Lemon Squeezy. Moyasar fallback verified.
4. Pre-launch quality A/B (Section 14): Turjuman SRT scored higher than YouTube auto-translate by 3 of 3 blind raters on 3 of 5 fixtures.
5. Distribution preflight done before Day 1: launch X thread drafted with demo clip + LinkedIn post drafted + 20 hand-picked @o0a98 followers DM'd with personal Pro Pack codes for honest feedback.

### Phase 1.5 — Launch Week (Day 1–7)

- Day 1: ship X thread, LinkedIn post, drop in 1–2 Saudi creator Discord/X group chats
- Day 3: post a "before/after" demo (CapCut auto-translate vs Turjuman) on X
- Day 5: Product Hunt launch (English + Arabic copy)
- Day 7: review telemetry — cost/min vs estimate, signup rate, conversion rate, error rate. Decide whether to continue, polish, or pivot.

### Phase 2 — Quality polish (week 5–8)

- CPL tiers 2 (story summary), 3 (entity ledger), 6 (glossary)
- Inline correction editor in player
- Back-translation drift check
- Discourse smoother
- Confidence badges per line
- Initial idiom database (500 entries) seeded — sourced from public Arabic-idiom corpora + Ali's manual review (target ~6 hours over 1 week, not open-ended)
- Studio Pack opens for purchase
- Re-evaluate adding Demucs source separation if quality data shows ASR errors concentrated in noisy audio

### Phase 3 — Distribution (week 5+)

- Telegram bot
- Public share links with embedded player
- Browser extension (one-click translate any video on the current page)
- Affiliate / referral system

### Phase 4 — Defensibility (month 2-3)

- Fine-tune the Phase-1 ASR engine (Scribe via API fine-tuning if available, else swap in a custom Whisper-LoRA built on aggregated user corrections, ~$30 one-time GPU run)
- Custom dialect-specific glossaries (Najdi, Hijazi, Egyptian, Levantine)
- (White-label / enterprise tier removed from this spec — separate document if it ever happens.)

---

## 16. Open Questions Deferred to Implementation

- Hetzner CPX41 confirmed as Phase 1 baseline; benchmark before launch and upgrade to CCX or GPU only if benchmark fails
- Whether to use Cloudflare Queue or a simple D1-polling worker (cost vs. simplicity)
- Specific subtitle font for Arabic (Tajawal? IBM Plex Sans Arabic?)
- Whether `/turjuman` shortcut serves the full page or redirects (likely redirect)
- Email sending: Resend vs. Cloudflare Email Routing

These don't change the design; they're tactical and will be decided when implementation begins.

---

## 17. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lemon Squeezy doesn't process mada cards reliably | **High** | Live test transaction before launch; Moyasar fallback wired in **Phase 1**, not deferred |
| Hetzner CPX41 (4 vCPU / 8 GB) cannot meet `<10 min for 5-min video` DoD | Medium | Benchmark on real 5/10/30-min fixtures before launch lock; if missed, drop to short-path-only or upgrade to GPU tier |
| Source platform breaks yt-dlp extractor | High (recurring) | Daily yt-dlp upgrade cron + Cobalt fallback + Tier 3 upload safety net |
| ElevenLabs Scribe Najdi/Hijazi WER is poor | **High** | Pre-launch fixture benchmark: Scribe vs Whisper-large-v3 vs Gemini multimodal on 30s Najdi/Hijazi/Levantine clips. Pick winner per WER + cost |
| Translation quality complaints from edge dialects | Medium | Manual glossary expansion + correction loop feeds future fine-tune |
| User uploads copyrighted content | **Medium** (not low) | Terms of service + auto-delete source MP4 at 30 days + register a DMCA agent + takedown endpoint at `/dmca` |
| Cost per minute exceeds the model in 8.3 | Medium | Pre-launch fixture validation; per-minute pricing means cost scales linearly so any deviation is visible immediately on the first paid jobs |
| Free tier multi-account abuse | **High** | Email + IP/24 quota tracking, disposable-email blocklist, IP rate limit on magic-link |
| 30-day public R2 share URL bandwidth cost on virality | **Medium** | Replaced with auth-required signed URLs (15-min validity); shareable embed page served via Cloudflare cache |
| WebSocket disconnect mid-job | Medium | SSE fallback + polling fallback; job state always recoverable from D1 |
| API key compromise | Medium | All keys in CF Worker secrets / Hetzner secrets manager; rotated quarterly; gitleaks pre-commit hook in CI |
| SSRF via user-submitted URL | High | URL scheme allowlist + DNS-resolve + reject private IP ranges before pipeline dispatch |

---

## 18. Success Metrics (90 days post-launch)

- **200+ unique signups in 90 days** (revised from 500 — honest target without an active acquisition machine; growth depends on @o0a98 reach + word-of-mouth)
- **15%+ free → paid conversion** (revised from 30% — industry norm is 2–5%, 15% is achievable when free tier is appropriately stingy at 10 min/month)
- **Cost per minute within ±20%** of the Section 8.3 model on real traffic
- **< 1% job error rate**
- **Average user correction rate < 5%** of cues once Phase 2 ships
- **Net revenue covers API + server costs by end of month 2**
- **No DMCA takedowns escalating to host-level action**
- **Curation hours by Ali ≤ 2 hr/week** post-launch (strategic guardrail — Codad must remain primary focus)
