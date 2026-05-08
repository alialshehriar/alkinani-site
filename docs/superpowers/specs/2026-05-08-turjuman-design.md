# Turjuman (ترجمان) — Design Specification

**Date**: 2026-05-08
**Author**: Ali Alkinani
**Status**: Brainstorm → Plan
**Site**: alkinani.live

---

## 1. Vision

A world-class video translation tool. The user pastes a link or uploads a video, gets back professional, context-aware subtitles in their target language. Quality competes with human translation. Lives inside `alkinani.live` as part of a "Tools by Ali" collection with a games-style switcher.

**Quality bar**: subtitles that respect story context, speaker identity, idioms, technical terminology, and cultural nuance — beyond what any single existing service produces.

**Business model**: 2 free videos per month, then paid credit packs in SAR. Healthy 50%+ profit margin.

---

## 2. Scope (v1)

**In scope**:
- Web app at `alkinani.live/tools/turjuman` and `alkinani.live/turjuman`
- Tools collection page at `alkinani.live/tools` with switcher between Turjuman and Radar (existing news tool)
- Source: any video link (1900+ sites via yt-dlp, with Cobalt fallback) OR direct file upload
- Auto-detect source language; user picks target language
- Output: interactive player + burned-in MP4 + SRT + VTT
- 6-layer Context Preservation Layer (CPL) for professional translation quality
- Hybrid model stack (Gemini 2.5 Pro for short videos, ElevenLabs Scribe + Claude Sonnet 4.6 for longer)
- Magic Link auth (email only, no passwords)
- Lemon Squeezy payments, credit-pack model in SAR
- 3 paid tiers + free tier
- Credits expire after 6 months

**Out of scope (deferred to v2)**:
- Telegram bot
- Subscription model (only one-off credit packs in v1)
- Self-hosted local model option (free tier with watermark)
- Fine-tuning Whisper on dialect data
- Speaker voice cloning / dubbing

---

## 3. Architecture

### 3.1 Component Map

```
┌──────────────────────────────────────────────────────────────┐
│  Web App (Vite + React 19 + Tailwind 4)                      │
│  alkinani.live  —  Cloudflare Pages                          │
│                                                              │
│  Routes:                                                     │
│   /                          existing landing                │
│   /tools                     new — switcher hub              │
│   /tools/turjuman            new — translation tool          │
│   /tools/radar               existing — news (moved here)    │
│   /turjuman                  alias for sharing               │
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
│  Pipeline Worker (Hetzner CPX31, Python 3.11)                │
│                                                              │
│  Pipeline (orchestrated, not agentic):                       │
│    1. yt-dlp / Cobalt fallback   → video.mp4                 │
│    2. ffmpeg + Demucs            → audio_clean.wav           │
│    3. Silero VAD                 → speech_segments           │
│    4. Router decides:                                        │
│         video < 5 min?                                       │
│           → Gemini 2.5 Pro multimodal (single call)          │
│         else:                                                │
│           → ElevenLabs Scribe + Claude (full CPL)            │
│    5. CPL (6 tiers) for long path                            │
│    6. SRT formatter (Netflix/BBC standards)                  │
│    7. ffmpeg burn → final.mp4                                │
│    8. Upload outputs → R2                                    │
│    9. Notify worker → trigger client WebSocket update        │
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

The tool must never tell the user "I cannot reach this video." Four-tier extraction:

| Tier | Tool | Coverage |
|---|---|---|
| 1 | `yt-dlp` (auto-updated daily) | 1900+ sites: YouTube, TikTok, IG, X, LinkedIn, Reddit, Vimeo, etc. |
| 2 | Cobalt API | Captures TikTok/IG that yt-dlp misses |
| 3 | Cookie / session injection (via headless Chrome) | Login-walled content (user provides session if needed) |
| 4 | Direct file upload (always available) | Final user safety net |

DRM-protected streams (Netflix, Shahid, Disney+) are explicitly out of scope.

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
- Subtitle styling controls: size, position, color
- Three downloads: MP4 (burned), SRT, VTT
- "Share" button copies a 30-day public R2 URL

**Phase 1 player** has only the read-only view: video, right-rail navigation, downloads, and share. Inline editing and confidence indicators arrive in Phase 2.

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

**1 credit = up to 10 minutes of video.** Longer videos consume credits proportionally (rounded up to the nearest credit).

### 8.2 Tiers

| Tier | Price | Credits | Effective per-video | Profit margin* |
|---|---|---|---|---|
| 🆓 Free | 0 SAR | 2 / month | — | — |
| 💎 Starter | **14 SAR** | 10 | 1.40 SAR | ~52% |
| ⚡ Pro | **49 SAR** | 50 | 0.98 SAR | ~50% |
| 🏆 Studio | **149 SAR** | 200 | 0.75 SAR | ~45% |

\* Margin assumes hybrid stack (Gemini multimodal for short videos, Scribe + Claude for longer).

### 8.3 Credit Lifecycle

- Credits expire **6 months** from purchase.
- Free credits reset on the 1st of each calendar month.
- Free credits do not stack (max 2 at any time).
- Refund policy: any unused credit < 30 days old, no questions asked.

### 8.4 Cost Model (per 5-minute video, hybrid stack)

| Cost item | USD | SAR |
|---|---|---|
| Gemini 2.5 Pro multimodal (if <5 min) | $0.04 | 0.15 |
| ElevenLabs Scribe (if >5 min) | $0.033 | 0.12 |
| Claude Sonnet 4.6 (translation + critique + smoother) | $0.10 | 0.38 |
| Claude Haiku (story summary) | $0.01 | 0.04 |
| Gemini Flash (visual context) | $0.02 | 0.08 |
| R2 storage + bandwidth | $0.005 | 0.02 |
| Server (Hetzner CPX31, amortized) | $0.003 | 0.01 |
| **Total (short path)** | **~$0.07** | **~0.27 SAR** |
| **Total (long path)** | **~$0.17** | **~0.65 SAR** |

---

## 9. Authentication & Identity

### 9.1 Auth Method

**Magic Link Email only.** No passwords, no social login (in v1).

- User enters email → Worker generates one-time token → email sent via Resend → link signs the user in for 30 days
- Sessions stored in Cloudflare KV with sliding expiration

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
  reason TEXT,                    -- 'starter_pack' | 'job:abc123' | 'free_grant'
  expires_at TEXT,                -- 6 months from purchase
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
  job_id TEXT REFERENCES jobs(id),
  cue_index INTEGER,
  original_text TEXT,
  corrected_text TEXT,
  source_lang TEXT,
  target_lang TEXT,
  created_at TEXT
)
```

---

## 10. Payments

### 10.1 Provider

**Lemon Squeezy** (already integrated with codad.co; reuse infrastructure).

### 10.2 Flow

1. User clicks "Buy Starter Pack" → Worker creates Lemon Squeezy checkout session → redirect
2. Lemon Squeezy hosts payment, supports mada via card (Saudi-ready)
3. On success, Lemon Squeezy webhook → Worker → adds credits to user with `expires_at = now + 6 months`
4. User redirected back to `/tools/turjuman` with a success toast

### 10.3 Products in Lemon Squeezy Dashboard

- `Turjuman Starter Pack` — 14 SAR — grants 10 credits
- `Turjuman Pro Pack` — 49 SAR — grants 50 credits
- `Turjuman Studio Pack` — 149 SAR — grants 200 credits

Each product's webhook body identifies which pack via SKU.

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
| Max video length | 90 minutes | Cost control + quality consistency |
| Max upload size | 2 GB | R2 economics |
| Max concurrent jobs per user | 2 | Fair queue for everyone |
| Job retention | 30 days | Storage cost |
| Free credits per month | 2 | Real product trial without abuse |
| Supported source languages | 99 (Whisper-supported) | — |
| Supported target languages | 45 (Claude best-supported) | — |

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

### Phase 1 — MVP (target: 2 weeks)

- Tools hub at `/tools` with switcher
- Turjuman page with link/upload UI
- Magic Link auth
- Hybrid pipeline (Gemini for short, Scribe+Claude for long), CPL tiers 1, 4, 5 only
- Subtitle formatter (Netflix-grade)
- Interactive player with view + download (no inline edit yet)
- Lemon Squeezy integration with all 3 tiers
- Free 2/month enforcement

**Definition of done**: a stranger can sign up, paste a YouTube link, get a downloadable MP4 with quality subtitles in under 10 minutes for a 5-minute video, on the free tier.

### Phase 2 — Quality polish (week 3-4)

- CPL tiers 2 (story summary), 3 (entity ledger), 6 (glossary)
- Inline correction editor in player
- Back-translation drift check
- Discourse smoother
- Confidence badges per line
- Initial idiom database (500 entries) seeded by Ali

### Phase 3 — Distribution (week 5+)

- Telegram bot
- Public share links with embedded player
- Browser extension (one-click translate any video on the current page)
- Affiliate / referral system

### Phase 4 — Defensibility (month 2-3)

- Fine-tune Whisper on aggregated user corrections (LoRA, ~$30 one-time)
- Custom dialect-specific glossaries (Najdi, Hijazi, Egyptian, Levantine)
- White-label / enterprise tier

---

## 16. Open Questions Deferred to Implementation

- Exact Hetzner instance sizing (CPX31 baseline; benchmark before launch)
- Whether to use Cloudflare Queue or a simple D1-polling worker (cost vs. simplicity)
- Specific subtitle font for Arabic (Tajawal? IBM Plex Sans Arabic?)
- Whether `/turjuman` shortcut serves the full page or redirects (likely redirect)
- Email sending: Resend vs. Cloudflare Email Routing

These don't change the design; they're tactical and will be decided when implementation begins.

---

## 17. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lemon Squeezy doesn't process mada cards reliably | Medium | Add Moyasar as fallback in Phase 2 |
| Hetzner CPU is too slow for >30-min videos at scale | Medium | Switch to Hetzner GPU tier when concurrent jobs exceed 5 |
| Source platform breaks yt-dlp extractor | High (recurring) | Daily yt-dlp upgrade cron + Cobalt fallback + clear error UX |
| Translation quality complaints from edge dialects | Medium | Manual glossary expansion + correction loop feeds future fine-tune |
| User uploads copyrighted content for translation | Low (legal) | Terms of service: user must own or have rights; auto-delete after 30 days |
| Cost per video exceeds estimate | Medium | Hard cap on max video length; per-user concurrency limit |

---

## 18. Success Metrics (90 days post-launch)

- 500+ unique signups
- 30%+ free → paid conversion
- < 1% job error rate
- Average user correction rate < 5% of cues (signal of high baseline quality)
- Net revenue covers API + server costs at month 2
