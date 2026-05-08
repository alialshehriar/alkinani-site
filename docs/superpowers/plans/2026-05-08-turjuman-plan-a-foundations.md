# Turjuman — Plan A: Foundations & Subdomain Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `turjuman.alkinani.live` subdomain as a working Cloudflare Pages app with magic-link authentication, persistent storage (D1, R2, KV), and a discoverable card on the parent `alkinani.live/tools` page. Output: a stranger can land on the subdomain, sign up by email, click a magic link, see a logged-in empty dashboard.

**Architecture:** New repo at `~/turjuman/` mirroring the parent site's stack (Vite + React 19 + Tailwind 4 + Pages Functions = Cloudflare Workers). All persistence is Cloudflare-native: D1 for relational data, R2 for video files (Plan B will use it), KV for sessions and rate limits. Auth is single-use 15-minute magic-link tokens via Resend, HttpOnly+Secure session cookies sliding up to 30 days. The parent `alkinani-site` repo gets a small new `/tools` route that links out — its existing VPS proxy stays untouched.

**Tech Stack:**
- New repo: Vite 8 + React 19 + TypeScript 6 + Tailwind 4
- Cloudflare: Pages, Workers (via Pages Functions), D1, R2, KV
- Email: Resend (custom domain `noreply@alkinani.live`)
- Auth: nanoid for token IDs, constant-time comparison for token verification
- Testing: Vitest + `@cloudflare/vitest-pool-workers` for Workers, Playwright for E2E
- Tooling: `wrangler` CLI, `bun` as package manager (matches parent repo)

**Reference**: `docs/superpowers/specs/2026-05-08-turjuman-design.md` Sections 2 (Scope), 9 (Auth), 12 (Limits).

---

## File Map

New repository at `~/turjuman/`:

| File | Responsibility |
|---|---|
| `package.json` | Deps + scripts (mirror alkinani-site) |
| `wrangler.toml` | CF Pages + bindings (D1, R2, KV) |
| `vite.config.ts` | Vite + React + Tailwind |
| `index.html` | App shell + meta |
| `src/main.tsx` | React root |
| `src/App.tsx` | Top-level router (no library — simple `useEffect` on URL) |
| `src/index.css` | Tailwind + ember/tide token system from parent |
| `src/lib/api.ts` | `fetch` wrapper for `/api/*` |
| `src/lib/auth.ts` | Client-side session helpers (`useSession` hook) |
| `src/lib/i18n.ts` | Arabic + English strings |
| `src/components/Landing.tsx` | Empty-state landing (placeholder for Plan C drop zone) |
| `src/components/LoginGate.tsx` | Email entry form |
| `src/components/LoginPending.tsx` | "Check your inbox" success state |
| `src/components/Dashboard.tsx` | Logged-in shell with header + jobs list (empty in Plan A) |
| `src/components/Header.tsx` | Email pill + logout button |
| `functions/api/auth/magic-link.ts` | `POST /api/auth/magic-link` — generate token + send email |
| `functions/api/auth/verify.ts` | `GET /api/auth/verify?token=…` — redeem token + set cookie |
| `functions/api/auth/logout.ts` | `POST /api/auth/logout` — clear KV session |
| `functions/api/auth/me.ts` | `GET /api/auth/me` — return current user or 401 |
| `functions/api/_middleware.ts` | Routes to `/api/*` handlers (no global auth — each handler decides) |
| `functions/lib/auth.ts` | Server-side: `verifyToken`, `createSession`, `readSession` |
| `functions/lib/email.ts` | Resend client wrapper |
| `functions/lib/d1.ts` | D1 query helpers (typed) |
| `functions/lib/disposable-emails.ts` | Hardcoded blocklist + check |
| `functions/lib/rate-limit.ts` | KV-backed sliding-window counter |
| `migrations/0001_initial.sql` | Users, credits_log, jobs, corrections schemas |
| `tests/auth.test.ts` | Vitest unit tests for token gen + verify |
| `tests/rate-limit.test.ts` | Rate limit logic |
| `tests/e2e/signup.spec.ts` | Playwright: full signup flow |

Parent repo `~/alkinani-site/` modifications:

| File | Change |
|---|---|
| `src/components/Tools.tsx` | NEW — tools hub at `/tools` |
| `src/components/ToolCard.tsx` | NEW — reusable card |
| `src/App.tsx` | Add `/tools` route |
| `src/components/Nav.tsx` | Add "Tools" entry |

---

## Phase 1 — Repo Bootstrap

### Task 1: Create `~/turjuman` repo

**Files:**
- Create: `~/turjuman/.gitignore`
- Create: `~/turjuman/README.md`

- [ ] **Step 1: Initialize repo**

Run:
```bash
mkdir -p ~/turjuman && cd ~/turjuman && git init -b main
```
Expected: `Initialized empty Git repository in /Users/a.s/turjuman/.git/`

- [ ] **Step 2: Create `.gitignore`**

Create `~/turjuman/.gitignore`:
```
node_modules/
dist/
.dev.vars
.wrangler/
.env
.env.local
*.log
.DS_Store
playwright-report/
test-results/
```

- [ ] **Step 3: Create minimal `README.md`**

Create `~/turjuman/README.md`:
```markdown
# Turjuman (ترجمان)

Video translation tool. Lives at https://turjuman.alkinani.live.

See `~/alkinani-site/docs/superpowers/specs/2026-05-08-turjuman-design.md` for the design spec.

## Local dev
```
bun install
bun run dev
```
```

- [ ] **Step 4: First commit**

Run:
```bash
cd ~/turjuman && git add -A && git commit -m "chore: initialize turjuman repo"
```

---

### Task 2: Bootstrap Vite + React 19 + TypeScript

**Files:**
- Create: `~/turjuman/package.json`
- Create: `~/turjuman/vite.config.ts`
- Create: `~/turjuman/tsconfig.json`
- Create: `~/turjuman/tsconfig.app.json`
- Create: `~/turjuman/tsconfig.node.json`
- Create: `~/turjuman/index.html`
- Create: `~/turjuman/src/main.tsx`
- Create: `~/turjuman/src/App.tsx`

- [ ] **Step 1: Create `package.json` mirroring parent stack**

Create `~/turjuman/package.json`:
```json
{
  "name": "turjuman",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "deploy": "bun run build && wrangler pages deploy dist",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.2.4",
    "clsx": "^2.1.1",
    "lucide-react": "^1.14.0",
    "motion": "^12.38.0",
    "nanoid": "^6.0.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "tailwindcss": "^4.2.4"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.10.0",
    "@cloudflare/workers-types": "^4.20260101.0",
    "@playwright/test": "^1.54.0",
    "@types/node": "^24.12.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "~6.0.2",
    "vite": "^8.0.10",
    "vitest": "^3.5.0",
    "wrangler": "^4.50.0"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

Create `~/turjuman/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 }, // alkinani-site uses 5173
});
```

- [ ] **Step 3: Create `tsconfig.json`**

Create `~/turjuman/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 4: Create `tsconfig.app.json`**

Create `~/turjuman/tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src", "functions"]
}
```

- [ ] **Step 5: Create `tsconfig.node.json`**

Create `~/turjuman/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create `index.html`**

Create `~/turjuman/index.html`:
```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="ترجمة فيديو احترافية تحترم السياق" />
    <title>ترجمان · Turjuman</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/main.tsx`**

Create `~/turjuman/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Create stub `src/App.tsx`**

Create `~/turjuman/src/App.tsx`:
```tsx
export default function App() {
  return (
    <main className="min-h-screen bg-ink-950 text-ink-100 grid place-items-center">
      <div className="text-center">
        <h1 className="text-5xl font-medium tracking-tight">ترجمان</h1>
        <p className="mt-3 text-ink-400">قريباً</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Install deps**

Run:
```bash
cd ~/turjuman && bun install
```
Expected: `Installed N packages`

- [ ] **Step 10: Commit**

Run:
```bash
cd ~/turjuman && git add -A && git commit -m "chore: bootstrap vite + react 19 + tailwind 4 stack"
```

---

### Task 3: Set up Tailwind 4 + design tokens (mirror parent)

**Files:**
- Create: `~/turjuman/src/index.css`

- [ ] **Step 1: Read parent CSS to copy token system**

Run:
```bash
cat ~/alkinani-site/src/index.css | head -80
```
Expected: prints the parent's `@import` + `@theme` block with `--color-ink-*`, `--color-ember-*`, `--color-tide-*` tokens.

- [ ] **Step 2: Create `src/index.css` with same tokens**

Create `~/turjuman/src/index.css` (copy the `@theme` block exactly so the visual identity stays consistent with `alkinani.live`):
```css
@import "tailwindcss";

@theme {
  --color-ink-50: #f4f6f8;
  --color-ink-100: #e3e7eb;
  --color-ink-200: #c1c8d0;
  --color-ink-300: #94a0ab;
  --color-ink-400: #6c7884;
  --color-ink-500: #4a5560;
  --color-ink-600: #353e47;
  --color-ink-700: #232a31;
  --color-ink-800: #161b20;
  --color-ink-900: #0d1014;
  --color-ink-950: #06080a;

  --color-ember-300: #ffd58a;
  --color-ember-400: #ffb347;
  --color-ember-500: #f08a1c;

  --color-tide-300: #87dcdc;
  --color-tide-400: #46b8c4;
  --color-tide-500: #1c8a98;

  --font-sans: "Tajawal", "Inter", system-ui, sans-serif;
}

html { font-family: var(--font-sans); }
body { background: var(--color-ink-950); color: var(--color-ink-100); }

/* Arabic letters MUST join cleanly. NO letter-spacing on Arabic text. */
[lang="ar"], [dir="rtl"] { letter-spacing: 0 !important; }
```

- [ ] **Step 3: Verify dev server starts**

Run:
```bash
cd ~/turjuman && bun run dev
```
Expected: `Local: http://localhost:5174/`. Open the URL — see "ترجمان · قريباً" rendered with Tajawal + ember accent. Stop the server (Ctrl-C).

- [ ] **Step 4: Commit**

Run:
```bash
cd ~/turjuman && git add -A && git commit -m "style: tailwind theme + tokens (mirror alkinani-site)"
```

---

## Phase 2 — Cloudflare Infrastructure

### Task 4: Create Cloudflare Pages project

**Files:** none (CF dashboard / wrangler operations)

- [ ] **Step 1: Verify wrangler is logged in**

Run:
```bash
cd ~/turjuman && bunx wrangler whoami
```
Expected: prints account email + ID. If not logged in, run `bunx wrangler login` and complete browser flow.

- [ ] **Step 2: Create the Pages project via wrangler**

Run:
```bash
cd ~/turjuman && bunx wrangler pages project create turjuman --production-branch main
```
Expected: `✨ Successfully created the 'turjuman' project. It will be available at https://turjuman.pages.dev/ once you create your first deployment.`

- [ ] **Step 3: First deploy (smoke)**

Run:
```bash
cd ~/turjuman && bun run build && bunx wrangler pages deploy dist --project-name=turjuman --branch=main --commit-dirty=true
```
Expected: deployment URL printed (e.g. `https://abc123.turjuman.pages.dev`). Visit URL, confirm "ترجمان · قريباً" renders.

---

### Task 5: Custom domain `turjuman.alkinani.live`

**Files:** none (CF dashboard operations)

- [ ] **Step 1: In CF dashboard, add custom domain**

Open https://dash.cloudflare.com → Workers & Pages → turjuman → Custom domains → "Set up a custom domain" → enter `turjuman.alkinani.live` → Activate.

- [ ] **Step 2: Verify DNS propagation**

Run:
```bash
dig turjuman.alkinani.live +short
```
Expected: returns one or more Cloudflare IPs (e.g. `172.66.x.x`). May take 1–2 minutes.

- [ ] **Step 3: Verify HTTPS**

Run:
```bash
curl -sI https://turjuman.alkinani.live/ | head -1
```
Expected: `HTTP/2 200`.

---

### Task 6: Provision R2 bucket

**Files:** none (wrangler operation)

- [ ] **Step 1: Create the bucket**

Run:
```bash
cd ~/turjuman && bunx wrangler r2 bucket create turjuman-prod
```
Expected: `✨ Created bucket 'turjuman-prod' with default storage class set to Standard.`

- [ ] **Step 2: Verify**

Run:
```bash
bunx wrangler r2 bucket list | grep turjuman-prod
```
Expected: line containing `turjuman-prod`.

---

### Task 7: Provision D1 database

**Files:** none initially (wrangler operation)

- [ ] **Step 1: Create the D1 database**

Run:
```bash
cd ~/turjuman && bunx wrangler d1 create turjuman-prod
```
Expected output includes a binding stanza:
```
[[d1_databases]]
binding = "DB"
database_name = "turjuman-prod"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

- [ ] **Step 2: Save the `database_id` for use in Task 9**

Open the printed `database_id` in a note — used in `wrangler.toml` next.

---

### Task 8: Provision KV namespace for sessions

**Files:** none (wrangler operation)

- [ ] **Step 1: Create the KV namespace**

Run:
```bash
cd ~/turjuman && bunx wrangler kv namespace create SESSIONS
```
Expected output includes:
```
[[kv_namespaces]]
binding = "SESSIONS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

- [ ] **Step 2: Create a second KV namespace for rate limiting**

Run:
```bash
cd ~/turjuman && bunx wrangler kv namespace create RATELIMIT
```
Save both IDs.

---

### Task 9: Wire bindings in `wrangler.toml`

**Files:**
- Create: `~/turjuman/wrangler.toml`

- [ ] **Step 1: Create `wrangler.toml`**

Create `~/turjuman/wrangler.toml` (substitute the IDs from Tasks 7–8):
```toml
name = "turjuman"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "turjuman-prod"
database_id = "PASTE-FROM-TASK-7"

[[kv_namespaces]]
binding = "SESSIONS"
id = "PASTE-FROM-TASK-8"

[[kv_namespaces]]
binding = "RATELIMIT"
id = "PASTE-FROM-TASK-8-SECOND"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "turjuman-prod"

[vars]
TURJUMAN_BASE_URL = "https://turjuman.alkinani.live"
RESEND_FROM = "noreply@alkinani.live"
ENVIRONMENT = "production"
```

- [ ] **Step 2: Commit**

Run:
```bash
cd ~/turjuman && git add wrangler.toml && git commit -m "chore: wire D1 + KV + R2 bindings"
```

---

## Phase 3 — D1 Schema

### Task 10: Write the initial migration

**Files:**
- Create: `~/turjuman/migrations/0001_initial.sql`

- [ ] **Step 1: Create `migrations/0001_initial.sql`**

Create `~/turjuman/migrations/0001_initial.sql`:
```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  credits_balance INTEGER NOT NULL DEFAULT 0,
  free_credits_remaining INTEGER NOT NULL DEFAULT 10,
  free_credits_reset_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);
CREATE INDEX idx_users_email ON users(email);

-- Credits ledger (every grant + every consumption is a row)
CREATE TABLE credits_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  expires_at TEXT,
  lemon_order_id TEXT UNIQUE,
  refunded_at TEXT,
  refund_amount_sar REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_credits_user ON credits_log(user_id);
CREATE INDEX idx_credits_lemon ON credits_log(lemon_order_id);

-- Jobs (filled in by Plan B; defined here so schema is one migration)
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT NOT NULL,
  duration_seconds INTEGER,
  credits_charged INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  output_mp4_key TEXT,
  output_srt_key TEXT,
  output_vtt_key TEXT,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_jobs_user ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);

-- Subtitle corrections (filled in by Plan C; PDPL retention policy applies)
CREATE TABLE corrections (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  user_id TEXT,
  cue_index INTEGER NOT NULL,
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  created_at TEXT NOT NULL,
  anonymized_at TEXT
);
CREATE INDEX idx_corrections_job ON corrections(job_id);
```

- [ ] **Step 2: Apply migration locally (creates a local SQLite mirror)**

Run:
```bash
cd ~/turjuman && bunx wrangler d1 migrations apply turjuman-prod --local
```
Expected: `🚣 Applied 1 migration`.

- [ ] **Step 3: Apply migration to remote D1**

Run:
```bash
cd ~/turjuman && bunx wrangler d1 migrations apply turjuman-prod --remote
```
Expected: `🚣 Applied 1 migration`.

- [ ] **Step 4: Verify schema on remote**

Run:
```bash
cd ~/turjuman && bunx wrangler d1 execute turjuman-prod --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```
Expected: rows for `users`, `credits_log`, `jobs`, `corrections`.

- [ ] **Step 5: Commit**

Run:
```bash
cd ~/turjuman && git add migrations/ && git commit -m "feat(db): initial schema (users + credits + jobs + corrections)"
```

---

## Phase 4 — Magic-Link Auth (Server)

### Task 11: Email + DNS setup for Resend

**Files:** none (DNS operations on Cloudflare for `alkinani.live`)

- [ ] **Step 1: Sign up / log in to Resend**

Open https://resend.com. If no account, sign up with the same email. Add domain `alkinani.live`.

- [ ] **Step 2: Add the SPF / DKIM / DMARC DNS records Resend instructs**

In CF dashboard → `alkinani.live` zone → DNS → Add records exactly as Resend shows (3 records: `_resend._domainkey` CNAME, `send` MX, `_dmarc` TXT).

- [ ] **Step 3: Verify domain in Resend**

In Resend dashboard, click "Verify". Wait until all records show green. May take up to 30 minutes.

- [ ] **Step 4: Generate a Resend API key**

In Resend → API Keys → Create. Scope: Sending access only. Copy the key.

- [ ] **Step 5: Store the key as a CF Worker secret**

Run:
```bash
cd ~/turjuman && bunx wrangler pages secret put RESEND_API_KEY --project-name=turjuman
```
Paste the key when prompted. Expected: `🌀 Creating the secret for the Pages project "turjuman"`.

---

### Task 12: D1 query helpers

**Files:**
- Create: `~/turjuman/functions/lib/d1.ts`

- [ ] **Step 1: Create `functions/lib/d1.ts`**

Create `~/turjuman/functions/lib/d1.ts`:
```ts
import type { D1Database } from "@cloudflare/workers-types";

export type User = {
  id: string;
  email: string;
  credits_balance: number;
  free_credits_remaining: number;
  free_credits_reset_at: string;
  created_at: string;
  last_active_at: string;
};

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const res = await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<User>();
  return res ?? null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const res = await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<User>();
  return res ?? null;
}

export async function createUser(db: D1Database, id: string, email: string): Promise<User> {
  const now = new Date().toISOString();
  // Free credits reset at the 1st of next month, midnight UTC.
  const next = new Date();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCHours(0, 0, 0, 0);
  const resetAt = next.toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, email, credits_balance, free_credits_remaining,
       free_credits_reset_at, created_at, last_active_at)
       VALUES (?, ?, 0, 10, ?, ?, ?)`
    )
    .bind(id, email.toLowerCase(), resetAt, now, now)
    .run();

  return (await getUserById(db, id))!;
}

export async function touchUser(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE users SET last_active_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
}
```

- [ ] **Step 2: Commit**

Run:
```bash
cd ~/turjuman && git add functions/lib/d1.ts && git commit -m "feat(db): user queries"
```

---

### Task 13: Disposable-email blocklist

**Files:**
- Create: `~/turjuman/functions/lib/disposable-emails.ts`
- Create: `~/turjuman/tests/disposable-emails.test.ts`

- [ ] **Step 1: Write the failing test**

Create `~/turjuman/tests/disposable-emails.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isDisposable } from "../functions/lib/disposable-emails";

describe("isDisposable", () => {
  it("returns true for known disposable domains", () => {
    expect(isDisposable("foo@mailinator.com")).toBe(true);
    expect(isDisposable("FOO@MAILINATOR.COM")).toBe(true);
    expect(isDisposable("alice@tempmail.com")).toBe(true);
  });

  it("returns false for legitimate domains", () => {
    expect(isDisposable("ali@gmail.com")).toBe(false);
    expect(isDisposable("user@alkinani.live")).toBe(false);
    expect(isDisposable("a@hotmail.sa")).toBe(false);
  });

  it("strips dot/plus tricks before comparing", () => {
    // Gmail-style "+tag" in disposable should still be caught
    expect(isDisposable("foo+spam@mailinator.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

First create a Vitest config so tests can be found:

Create `~/turjuman/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

Run:
```bash
cd ~/turjuman && bun run test tests/disposable-emails.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `disposable-emails.ts`**

Create `~/turjuman/functions/lib/disposable-emails.ts`:
```ts
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "trashmail.com",
  "throwawaymail.com",
  "yopmail.com",
  "maildrop.cc",
  "getnada.com",
  "sharklasers.com",
  "tempinbox.com",
  "fakeinbox.com",
  "spam4.me",
  "tmpmail.org",
  "tempr.email",
  "discard.email",
  "mintemail.com",
  "mt2015.com",
  "binkmail.com",
]);

export function isDisposable(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd ~/turjuman && bun run test tests/disposable-emails.test.ts
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

Run:
```bash
cd ~/turjuman && git add -A && git commit -m "feat(auth): disposable email blocklist"
```

---

### Task 14: Rate limit helper

**Files:**
- Create: `~/turjuman/functions/lib/rate-limit.ts`
- Create: `~/turjuman/tests/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `~/turjuman/tests/rate-limit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkAndIncrement } from "../functions/lib/rate-limit";

// Minimal in-memory KV mock
class FakeKV {
  store = new Map<string, { value: string; expires_at: number }>();
  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expires_at <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  async put(key: string, value: string, opts?: { expirationTtl?: number }) {
    const ttl = opts?.expirationTtl ?? 3600;
    this.store.set(key, { value, expires_at: Date.now() + ttl * 1000 });
  }
}

describe("checkAndIncrement", () => {
  let kv: FakeKV;
  beforeEach(() => { kv = new FakeKV(); });

  it("allows the first 5 requests", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await checkAndIncrement(kv as any, "magic:1.2.3.4", 5, 3600);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the 6th request within the window", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndIncrement(kv as any, "magic:1.2.3.4", 5, 3600);
    }
    const result = await checkAndIncrement(kv as any, "magic:1.2.3.4", 5, 3600);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("uses separate counters per key", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndIncrement(kv as any, "magic:1.2.3.4", 5, 3600);
    }
    const result = await checkAndIncrement(kv as any, "magic:5.6.7.8", 5, 3600);
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd ~/turjuman && bun run test tests/rate-limit.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement rate-limit**

Create `~/turjuman/functions/lib/rate-limit.ts`:
```ts
import type { KVNamespace } from "@cloudflare/workers-types";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

/**
 * Simple fixed-window counter. `key` should already include the bucket
 * (e.g. "magic:1.2.3.4"). `limit` is the max requests per `windowSeconds`.
 */
export async function checkAndIncrement(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;

  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }

  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: limit - next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd ~/turjuman && bun run test tests/rate-limit.test.ts
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

Run:
```bash
cd ~/turjuman && git add -A && git commit -m "feat(auth): KV-backed rate limit helper"
```

---

### Task 15: Email helper (Resend wrapper)

**Files:**
- Create: `~/turjuman/functions/lib/email.ts`

- [ ] **Step 1: Create `functions/lib/email.ts`**

Create `~/turjuman/functions/lib/email.ts`:
```ts
type SendArgs = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(args: SendArgs): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body}` };
  }
  return { ok: true };
}

export function magicLinkEmailHTML(link: string): string {
  return `
<!doctype html>
<html dir="auto">
<body style="font-family:Tajawal,Inter,system-ui,sans-serif;background:#06080a;color:#e3e7eb;padding:40px;">
  <h1 style="color:#ffb347;font-weight:500;">ترجمان</h1>
  <p>اضغط الرابط أدناه لتسجيل الدخول. الرابط صالح لمدة ١٥ دقيقة، ولا يمكن استخدامه إلا مرة واحدة.</p>
  <p style="margin:24px 0;"><a href="${link}" style="background:#ffb347;color:#06080a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;">دخول</a></p>
  <p style="color:#6c7884;font-size:12px;">إذا لم تطلب هذا الرابط، تجاهل هذه الرسالة.</p>
  <hr style="border:0;border-top:1px solid #232a31;margin:32px 0;" />
  <p>Click the button above to sign in. The link is valid for 15 minutes and is single-use.</p>
</body>
</html>`.trim();
}

export function magicLinkEmailText(link: string): string {
  return `ترجمان · سجّل دخولك\n\n${link}\n\nصالح ١٥ دقيقة، استخدام واحد.`;
}
```

- [ ] **Step 2: Commit**

Run:
```bash
cd ~/turjuman && git add functions/lib/email.ts && git commit -m "feat(auth): resend email helper + bilingual template"
```

---

### Task 16: Auth core (token + session helpers)

**Files:**
- Create: `~/turjuman/functions/lib/auth.ts`
- Create: `~/turjuman/tests/auth.test.ts`

- [ ] **Step 1: Write the failing test for `constantTimeEqual`**

Create `~/turjuman/tests/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { constantTimeEqual, generateToken } from "../functions/lib/auth";

describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });
  it("returns false for differing strings", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
  it("returns false for different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("generateToken", () => {
  it("returns a 32-character URL-safe token", () => {
    const t = generateToken();
    expect(t).toHaveLength(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("returns different tokens on each call", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run:
```bash
cd ~/turjuman && bun run test tests/auth.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement auth helpers**

Create `~/turjuman/functions/lib/auth.ts`:
```ts
import { nanoid, customAlphabet } from "nanoid";
import type { KVNamespace } from "@cloudflare/workers-types";

const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const tokenAlphabet = customAlphabet(URL_SAFE, 32);

export function generateToken(): string {
  return tokenAlphabet();
}

/** Constant-time string comparison; resistant to timing attacks. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

const MAGIC_TOKEN_TTL_SEC = 15 * 60;          // 15 minutes
const SESSION_BASE_TTL_SEC = 7 * 24 * 60 * 60; // 7 days sliding extension
const SESSION_HARD_CAP_SEC = 30 * 24 * 60 * 60; // 30-day max

export type StoredMagicToken = {
  email: string;
  created_at: number;
};

export type StoredSession = {
  user_id: string;
  email: string;
  created_at: number;
  hard_cap_at: number;
};

export async function storeMagicToken(
  kv: KVNamespace,
  token: string,
  email: string
): Promise<void> {
  const value: StoredMagicToken = { email, created_at: Date.now() };
  await kv.put(`magic:${token}`, JSON.stringify(value), {
    expirationTtl: MAGIC_TOKEN_TTL_SEC,
  });
}

export async function consumeMagicToken(
  kv: KVNamespace,
  token: string
): Promise<StoredMagicToken | null> {
  const raw = await kv.get(`magic:${token}`);
  if (!raw) return null;
  await kv.delete(`magic:${token}`); // single-use
  return JSON.parse(raw) as StoredMagicToken;
}

export async function createSession(
  kv: KVNamespace,
  user: { id: string; email: string }
): Promise<string> {
  const sessionId = nanoid(48); // 48 chars from default alphabet ≥ 192 bits entropy
  const now = Date.now();
  const value: StoredSession = {
    user_id: user.id,
    email: user.email,
    created_at: now,
    hard_cap_at: now + SESSION_HARD_CAP_SEC * 1000,
  };
  await kv.put(`session:${sessionId}`, JSON.stringify(value), {
    expirationTtl: SESSION_BASE_TTL_SEC,
  });
  return sessionId;
}

export async function readSession(
  kv: KVNamespace,
  sessionId: string
): Promise<StoredSession | null> {
  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) return null;
  const session = JSON.parse(raw) as StoredSession;
  if (Date.now() > session.hard_cap_at) {
    await kv.delete(`session:${sessionId}`);
    return null;
  }
  // Sliding extension: re-write with fresh 7-day TTL on every read.
  await kv.put(`session:${sessionId}`, raw, {
    expirationTtl: SESSION_BASE_TTL_SEC,
  });
  return session;
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string
): Promise<void> {
  await kv.delete(`session:${sessionId}`);
}

const SESSION_COOKIE = "tj_session";

export function buildSessionCookie(value: string, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_BASE_TTL_SEC}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildClearSessionCookie(secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd ~/turjuman && bun run test tests/auth.test.ts
```
Expected: 5 PASS.

- [ ] **Step 5: Commit**

Run:
```bash
cd ~/turjuman && git add -A && git commit -m "feat(auth): token + session core helpers (single-use 15-min token, sliding 7-day cookie, 30-day hard cap)"
```

---

### Task 17: Worker endpoint `POST /api/auth/magic-link`

**Files:**
- Create: `~/turjuman/functions/api/auth/magic-link.ts`

- [ ] **Step 1: Create the endpoint**

Create `~/turjuman/functions/api/auth/magic-link.ts`:
```ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { generateToken, storeMagicToken } from "../../lib/auth";
import { isDisposable } from "../../lib/disposable-emails";
import { checkAndIncrement } from "../../lib/rate-limit";
import {
  sendEmail,
  magicLinkEmailHTML,
  magicLinkEmailText,
} from "../../lib/email";

interface Env {
  SESSIONS: KVNamespace;
  RATELIMIT: KVNamespace;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  TURJUMAN_BASE_URL: string;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1. Parse body
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RX.test(email)) return jsonError(400, "invalid_email");
  if (isDisposable(email)) return jsonError(400, "disposable_email");

  // 2. Per-IP rate limit (5 / hour)
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rl = await checkAndIncrement(env.RATELIMIT, `magic:ip:${ip}`, 5, 3600);
  if (!rl.allowed) return jsonError(429, "rate_limited");

  // 3. Generate token + store
  const token = generateToken();
  await storeMagicToken(env.SESSIONS, token, email);

  // 4. Send email
  const link = `${env.TURJUMAN_BASE_URL}/api/auth/verify?token=${token}`;
  const result = await sendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
    to: email,
    subject: "ترجمان · سجّل دخولك / Sign in to Turjuman",
    html: magicLinkEmailHTML(link),
    text: magicLinkEmailText(link),
  });
  if (!result.ok) {
    console.error("resend_failed", result.error);
    return jsonError(502, "email_failed");
  }

  return jsonOk({ sent: true });
};

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Commit**

Run:
```bash
cd ~/turjuman && git add functions/api/auth/magic-link.ts && git commit -m "feat(auth): POST /api/auth/magic-link endpoint"
```

---

### Task 18: Worker endpoint `GET /api/auth/verify`

**Files:**
- Create: `~/turjuman/functions/api/auth/verify.ts`

- [ ] **Step 1: Create the endpoint**

Create `~/turjuman/functions/api/auth/verify.ts`:
```ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { nanoid } from "nanoid";
import {
  consumeMagicToken,
  createSession,
  buildSessionCookie,
} from "../../lib/auth";
import { getUserByEmail, createUser, touchUser } from "../../lib/d1";

interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  TURJUMAN_BASE_URL: string;
  ENVIRONMENT: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return redirectErr(env, "missing_token");

  const stored = await consumeMagicToken(env.SESSIONS, token);
  if (!stored) return redirectErr(env, "expired_or_used");

  // Find or create user
  let user = await getUserByEmail(env.DB, stored.email);
  if (!user) {
    user = await createUser(env.DB, nanoid(16), stored.email);
  } else {
    await touchUser(env.DB, user.id);
  }

  // Create session
  const sessionId = await createSession(env.SESSIONS, {
    id: user.id,
    email: user.email,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.TURJUMAN_BASE_URL}/`,
      "Set-Cookie": buildSessionCookie(sessionId, env.ENVIRONMENT === "production"),
    },
  });
};

function redirectErr(env: Env, code: string): Response {
  return Response.redirect(`${env.TURJUMAN_BASE_URL}/login?error=${code}`, 302);
}
```

- [ ] **Step 2: Commit**

Run:
```bash
cd ~/turjuman && git add functions/api/auth/verify.ts && git commit -m "feat(auth): GET /api/auth/verify (redeem token + set cookie)"
```

---

### Task 19: Worker endpoints `POST /api/auth/logout` + `GET /api/auth/me`

**Files:**
- Create: `~/turjuman/functions/api/auth/logout.ts`
- Create: `~/turjuman/functions/api/auth/me.ts`

- [ ] **Step 1: Create logout endpoint**

Create `~/turjuman/functions/api/auth/logout.ts`:
```ts
import type { PagesFunction } from "@cloudflare/workers-types";
import {
  readSessionCookie,
  deleteSession,
  buildClearSessionCookie,
} from "../../lib/auth";

interface Env {
  SESSIONS: KVNamespace;
  ENVIRONMENT: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const sid = readSessionCookie(request);
  if (sid) await deleteSession(env.SESSIONS, sid);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildClearSessionCookie(env.ENVIRONMENT === "production"),
    },
  });
};
```

- [ ] **Step 2: Create me endpoint**

Create `~/turjuman/functions/api/auth/me.ts`:
```ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { readSessionCookie, readSession } from "../../lib/auth";
import { getUserById } from "../../lib/d1";

interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sid = readSessionCookie(request);
  if (!sid) return j(401, { error: "unauthenticated" });

  const session = await readSession(env.SESSIONS, sid);
  if (!session) return j(401, { error: "session_expired" });

  const user = await getUserById(env.DB, session.user_id);
  if (!user) return j(401, { error: "user_not_found" });

  return j(200, {
    user: {
      id: user.id,
      email: user.email,
      credits_balance: user.credits_balance,
      free_credits_remaining: user.free_credits_remaining,
    },
  });
};

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 3: Commit**

Run:
```bash
cd ~/turjuman && git add functions/api/auth/ && git commit -m "feat(auth): logout + me endpoints"
```

---

## Phase 5 — Frontend Auth UI

### Task 20: Client API + session hook

**Files:**
- Create: `~/turjuman/src/lib/api.ts`
- Create: `~/turjuman/src/lib/auth.ts`

- [ ] **Step 1: Create `src/lib/api.ts`**

Create `~/turjuman/src/lib/api.ts`:
```ts
export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 2: Create `src/lib/auth.ts`**

Create `~/turjuman/src/lib/auth.ts`:
```tsx
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "./api";

export type SessionUser = {
  id: string;
  email: string;
  credits_balance: number;
  free_credits_remaining: number;
};

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ user: SessionUser }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { user, loading, refresh };
}

export async function requestMagicLink(email: string): Promise<void> {
  await apiFetch("/api/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}
```

- [ ] **Step 3: Commit**

Run:
```bash
cd ~/turjuman && git add src/lib/ && git commit -m "feat(auth-ui): client api wrapper + useSession hook"
```

---

### Task 21: Login UI components

**Files:**
- Create: `~/turjuman/src/components/LoginGate.tsx`
- Create: `~/turjuman/src/components/LoginPending.tsx`

- [ ] **Step 1: Create `LoginGate.tsx`**

Create `~/turjuman/src/components/LoginGate.tsx`:
```tsx
import { useState } from "react";
import { requestMagicLink } from "../lib/auth";

type Props = { onSent: (email: string) => void };

export function LoginGate({ onSent }: Props) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestMagicLink(email);
      onSent(email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg.includes("disposable_email")) setError("بريد مؤقت غير مدعوم.");
      else if (msg.includes("rate_limited")) setError("الرجاء الانتظار قليلاً ثم المحاولة.");
      else if (msg.includes("invalid_email")) setError("صيغة البريد غير صحيحة.");
      else setError("حدث خطأ. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-medium tracking-tight">ترجمان</h1>
          <p className="text-ink-400">سجّل بدخولك بريدك. نرسل لك رابط دخول.</p>
        </header>
        <input
          dir="ltr"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full bg-ink-900 border border-ink-700 rounded-lg px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-ember-400"
        />
        {error && <p className="text-rose-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-ember-400 text-ink-950 font-medium rounded-lg py-3 disabled:opacity-50"
        >
          {submitting ? "جاري الإرسال..." : "أرسل رابط الدخول"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `LoginPending.tsx`**

Create `~/turjuman/src/components/LoginPending.tsx`:
```tsx
type Props = { email: string; onChangeEmail: () => void };

export function LoginPending({ email, onChangeEmail }: Props) {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-medium tracking-tight">تحقق من بريدك</h1>
        <p className="text-ink-400">
          أرسلنا رابط الدخول إلى <span dir="ltr" className="text-ink-100">{email}</span>.
          الرابط صالح ١٥ دقيقة.
        </p>
        <button onClick={onChangeEmail} className="text-ember-400 underline">
          استخدام بريد آخر
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

Run:
```bash
cd ~/turjuman && git add src/components/Login*.tsx && git commit -m "feat(auth-ui): LoginGate + LoginPending"
```

---

### Task 22: Dashboard shell

**Files:**
- Create: `~/turjuman/src/components/Dashboard.tsx`
- Create: `~/turjuman/src/components/Header.tsx`

- [ ] **Step 1: Create `Header.tsx`**

Create `~/turjuman/src/components/Header.tsx`:
```tsx
import { logout } from "../lib/auth";

type Props = { email: string; freeCredits: number; paidCredits: number };

export function Header({ email, freeCredits, paidCredits }: Props) {
  async function handleLogout() {
    await logout();
    window.location.reload();
  }
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-ink-800">
      <h1 className="text-2xl font-medium">ترجمان</h1>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-ink-300">
          مجاني: <span className="text-ember-400">{freeCredits}</span> دقيقة
          {paidCredits > 0 && (
            <> · مدفوع: <span className="text-ember-400">{paidCredits}</span> دقيقة</>
          )}
        </span>
        <span dir="ltr" className="text-ink-400">{email}</span>
        <button onClick={handleLogout} className="text-ink-400 hover:text-ink-100">
          خروج
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `Dashboard.tsx`**

Create `~/turjuman/src/components/Dashboard.tsx`:
```tsx
import { Header } from "./Header";
import type { SessionUser } from "../lib/auth";

type Props = { user: SessionUser };

export function Dashboard({ user }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header
        email={user.email}
        freeCredits={user.free_credits_remaining}
        paidCredits={user.credits_balance}
      />
      <main className="flex-1 grid place-items-center px-6 py-12">
        <div className="text-center max-w-md space-y-3">
          <p className="text-2xl">جاهز للترجمة</p>
          <p className="text-ink-400">
            ميزة الرفع تنزل قريباً. (الواجهة الكاملة في Plan C)
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

Run:
```bash
cd ~/turjuman && git add src/components/Header.tsx src/components/Dashboard.tsx && git commit -m "feat(ui): dashboard shell with header + credit pill"
```

---

### Task 23: Wire `App.tsx` routing

**Files:**
- Modify: `~/turjuman/src/App.tsx`

- [ ] **Step 1: Replace `App.tsx` with the routed version**

Overwrite `~/turjuman/src/App.tsx`:
```tsx
import { useState, useEffect } from "react";
import { useSession } from "./lib/auth";
import { LoginGate } from "./components/LoginGate";
import { LoginPending } from "./components/LoginPending";
import { Dashboard } from "./components/Dashboard";

export default function App() {
  const { user, loading } = useSession();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setLoginError(err);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center text-ink-400">
        <span>...</span>
      </main>
    );
  }

  if (user) return <Dashboard user={user} />;
  if (pendingEmail)
    return (
      <LoginPending
        email={pendingEmail}
        onChangeEmail={() => setPendingEmail(null)}
      />
    );

  return (
    <>
      {loginError && (
        <div className="bg-rose-900/30 text-rose-300 text-center py-3">
          الرابط منتهي أو مستخدم — اطلب رابطاً جديداً
        </div>
      )}
      <LoginGate onSent={setPendingEmail} />
    </>
  );
}
```

- [ ] **Step 2: Run dev server, test the flow**

Run:
```bash
cd ~/turjuman && bun run dev
```
Open http://localhost:5174/. Expected: see the LoginGate. (Backend won't work locally without `wrangler pages dev` — Task 24 wires that.)
Stop with Ctrl-C.

- [ ] **Step 3: Commit**

Run:
```bash
cd ~/turjuman && git add src/App.tsx && git commit -m "feat(ui): app routing — login → pending → dashboard"
```

---

### Task 24: Wire local dev with `wrangler pages dev`

**Files:**
- Modify: `~/turjuman/package.json`
- Create: `~/turjuman/.dev.vars`

- [ ] **Step 1: Create `.dev.vars` with development secrets**

Create `~/turjuman/.dev.vars` (gitignored):
```
RESEND_API_KEY=PASTE_YOUR_RESEND_DEV_KEY
ENVIRONMENT=development
TURJUMAN_BASE_URL=http://localhost:8788
RESEND_FROM=noreply@alkinani.live
```

- [ ] **Step 2: Update `scripts.dev` to run wrangler against the built frontend**

Modify `~/turjuman/package.json` `scripts` block to:
```json
"scripts": {
  "dev": "vite",
  "dev:cf": "vite build --watch & wrangler pages dev dist --d1=DB=turjuman-prod --kv=SESSIONS --kv=RATELIMIT --r2=MEDIA=turjuman-prod --port=8788",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "deploy": "bun run build && wrangler pages deploy dist",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 3: Run `bun run dev:cf`**

Run:
```bash
cd ~/turjuman && bun run dev:cf
```
Expected: vite builds, wrangler starts on port 8788. Open http://localhost:8788 → LoginGate renders. Submit your real email → check inbox → click link → redirected to localhost:8788/ as logged-in Dashboard.

If the email send fails, check Resend dashboard logs and ensure DNS verified (Task 11).

- [ ] **Step 4: Commit**

Run:
```bash
cd ~/turjuman && git add package.json && git commit -m "chore: dev:cf script for local Pages Functions"
```

---

## Phase 6 — Tools Hub on Parent Site

### Task 25: Create `Tools.tsx` on `alkinani-site`

**Files:**
- Create: `~/alkinani-site/src/components/ToolCard.tsx`
- Create: `~/alkinani-site/src/components/Tools.tsx`

- [ ] **Step 1: Create `ToolCard.tsx`**

Create `~/alkinani-site/src/components/ToolCard.tsx`:
```tsx
import clsx from "clsx";

type Props = {
  title: string;
  arabicTitle: string;
  description: string;
  href: string;
  external?: boolean;
  badge?: string;
};

export function ToolCard({ title, arabicTitle, description, href, external, badge }: Props) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={clsx(
        "block rounded-2xl border border-ink-800 bg-ink-900/40 p-6",
        "transition hover:border-ember-400/50 hover:bg-ink-900"
      )}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-2xl font-medium">{arabicTitle}</h3>
        {badge && (
          <span className="text-xs uppercase tracking-[0.22em] text-ember-400">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-ink-400 text-sm" dir="ltr">{title}</p>
      <p className="mt-4 text-ink-300">{description}</p>
    </a>
  );
}
```

- [ ] **Step 2: Create `Tools.tsx`**

Create `~/alkinani-site/src/components/Tools.tsx`:
```tsx
import { ToolCard } from "./ToolCard";

export function Tools() {
  return (
    <section className="min-h-screen px-6 sm:px-12 py-20">
      <header className="max-w-3xl mx-auto text-center mb-16">
        <h1 className="text-5xl font-medium tracking-tight">أدوات علي</h1>
        <p className="mt-4 text-ink-400">
          أدوات صنعتها لأشغل بها يومي. مفتوحة للجميع.
        </p>
      </header>
      <div className="max-w-3xl mx-auto grid gap-4 sm:grid-cols-2">
        <ToolCard
          title="Turjuman"
          arabicTitle="ترجمان"
          description="ترجمة فيديو احترافية تحترم السياق."
          href="https://turjuman.alkinani.live"
          external
          badge="جديد"
        />
        <ToolCard
          title="Radar"
          arabicTitle="رادار"
          description="آخر الأخبار التقنية مفسّرة بالعربي."
          href="/#radar"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

Run:
```bash
cd ~/alkinani-site && git add src/components/ToolCard.tsx src/components/Tools.tsx && git commit -m "feat(tools): tools hub component + ToolCard"
```

---

### Task 26: Add `/tools` route + nav entry (concrete edits)

**Files:**
- Modify: `~/alkinani-site/src/lib/i18n.ts:9`
- Modify: `~/alkinani-site/src/components/Nav.tsx:16-21`
- Modify: `~/alkinani-site/src/components/Nav.tsx:60-71`
- Modify: `~/alkinani-site/src/App.tsx:22` (add early return)

- [ ] **Step 1: Add the `tools` copy to `i18n.ts`**

In `~/alkinani-site/src/lib/i18n.ts`, modify the `copy.nav` block:
```ts
  nav: {
    work: { ar: "الأعمال", en: "Work" },
    method: { ar: "الطريقة", en: "Method" },
    lab: { ar: "العب", en: "Play" },
    tools: { ar: "أدوات", en: "Tools" },        // ADD THIS LINE
    ask: { ar: "اسألني", en: "Ask" },
    contact: { ar: "تواصل", en: "Contact" },
  },
```

- [ ] **Step 2: Add Tools to Nav.tsx items + render with `href`**

In `~/alkinani-site/src/components/Nav.tsx`, change the `items` array (around line 16) to include an `href` field and a tools entry:
```tsx
  const items = [
    { id: "work", label: copy.nav.work, icon: "▦", href: "#work" },
    { id: "lab", label: copy.nav.lab, icon: "🎮", href: "#lab" },
    { id: "tools", label: copy.nav.tools, icon: "▣", href: "/tools" },
    { id: "ask", label: copy.nav.ask, icon: "✷", href: "#ask" },
    { id: "contact", label: copy.nav.contact, icon: "↗", href: "#contact" },
  ];
```

Then in the desktop nav block (around line 62), update the `<a href>`:
```tsx
            {items.map((it) => (
              <a
                key={it.id}
                href={it.href}
                data-cursor="hover"
                className="text-sm text-ink-300 transition hover:text-ink-100"
              >
                {t(it.label, lang)}
              </a>
            ))}
```

If the mobile drawer (lower in the same file) also iterates `items`, apply the same `href={it.href}` change there.

- [ ] **Step 3: Add an early-return route guard in `App.tsx`**

In `~/alkinani-site/src/App.tsx`, add the import and an early return at the top of the `App` function body (between the `useState` hooks at line 23-26 and the `useEffect` at line 28):

```tsx
import { Tools } from "./components/Tools";
// ... other existing imports
```

Then inside `App()`, immediately after the `useState` for `lang`:
```tsx
  // /tools route — bypass the scroll layout entirely
  if (typeof window !== "undefined" && window.location.pathname === "/tools") {
    return <Tools />;
  }
```

- [ ] **Step 4: Build to verify no TypeScript errors**

Run:
```bash
cd ~/alkinani-site && bun run build
```
Expected: `tsc -b` passes, `vite build` produces `dist/`.

- [ ] **Step 5: Manual test in dev**

Run:
```bash
cd ~/alkinani-site && bun run dev
```
Open `http://localhost:5173/tools`. Expected: Tools page renders with both cards. Click "Tools" in the nav from `/`: routes to `/tools`. Stop dev server.

- [ ] **Step 6: Commit**

Run:
```bash
cd ~/alkinani-site && git add src/App.tsx src/components/Nav.tsx src/lib/i18n.ts && git commit -m "feat(tools): /tools route + nav entry"
```

---

## Phase 7 — Smoke Test + Deployment

### Task 27: Playwright E2E setup

**Files:**
- Create: `~/turjuman/playwright.config.ts`
- Create: `~/turjuman/tests/e2e/login.spec.ts`

- [ ] **Step 1: Install Playwright browsers**

Run:
```bash
cd ~/turjuman && bunx playwright install chromium
```

- [ ] **Step 2: Create Playwright config**

Create `~/turjuman/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:8788",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

- [ ] **Step 3: Create the smoke test**

Create `~/turjuman/tests/e2e/login.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("login gate renders and rejects bad email", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ترجمان" })).toBeVisible();

  const input = page.getByPlaceholder("you@example.com");
  await input.fill("not-an-email");
  await page.getByRole("button", { name: /أرسل/ }).click();
  await expect(page.getByText(/صيغة البريد/)).toBeVisible();
});

test("disposable email is blocked", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill("foo@mailinator.com");
  await page.getByRole("button", { name: /أرسل/ }).click();
  await expect(page.getByText(/مؤقت/)).toBeVisible();
});
```

- [ ] **Step 4: Run E2E (with dev:cf already running in another terminal)**

Run:
```bash
# In terminal 1:
cd ~/turjuman && bun run dev:cf
# In terminal 2:
cd ~/turjuman && bun run test:e2e
```
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

Run:
```bash
cd ~/turjuman && git add playwright.config.ts tests/e2e/ && git commit -m "test: playwright e2e for login gate"
```

---

### Task 28: Deploy parent site changes to production

**Files:** none (deployment)

- [ ] **Step 1: Verify build is clean**

Run:
```bash
cd ~/alkinani-site && bun run build
```
Expected: build succeeds with no errors.

- [ ] **Step 2: Deploy parent site (matches existing deploy convention)**

Use the parent site's existing deploy mechanism. Inspect `package.json` to find it:
```bash
cd ~/alkinani-site && grep -A1 '"deploy"' package.json
```
Run that command. Wait for deployment URL.

- [ ] **Step 3: Visit `https://alkinani.live/tools` and verify the page renders, both cards visible, Turjuman link goes to `https://turjuman.alkinani.live`**

---

### Task 29: Deploy turjuman to production

**Files:** none (deployment)

- [ ] **Step 1: Build + deploy**

Run:
```bash
cd ~/turjuman && bun run deploy
```
Expected: prints `https://turjuman.alkinani.live` (production deployment).

- [ ] **Step 2: Manual smoke on production**

Open `https://turjuman.alkinani.live`. Type your real email. Click submit. Open inbox. Click magic link. Confirm you land on the Dashboard with your email + "10 دقيقة" free credit pill.

- [ ] **Step 3: Tag the Plan A milestone**

Run:
```bash
cd ~/turjuman && git tag -a v0.1.0-foundations -m "Plan A complete: subdomain + auth + tools hub"
```

---

## Acceptance Criteria (Plan A complete when all true)

- `https://turjuman.alkinani.live/` renders the LoginGate with no JS errors
- A new email signs up successfully (creates a `users` row with 10 free credits)
- The magic link in the email opens, redeems exactly once, sets the cookie, and lands the user on the Dashboard
- Reusing the same magic link returns to `/login?error=expired_or_used`
- Logout clears the cookie and returns to LoginGate
- Disposable-email submission shows "بريد مؤقت غير مدعوم"
- 6th magic-link request from the same IP within an hour is rate-limited
- `https://alkinani.live/tools` renders, with Turjuman card linking to the subdomain
- `bun run test` passes on `~/turjuman` (3 test files: disposable-emails, rate-limit, auth)
- `bun run test:e2e` passes (2 Playwright tests)

---

## Out of Scope for Plan A (handled by later plans)

- Drop zone, file upload, R2 multipart (Plan C)
- Pipeline (Plan B)
- Pricing page UI + Lemon Squeezy checkout (Plan D)
- Webhook handlers + credit grants (Plan D)
- Mobile responsive polish for the Dashboard (Plan C)
- DMCA endpoint (Plan D)
- Telemetry + cost tracking (Plan D)
