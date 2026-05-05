# Ali Alkinani — Personal Site

A cinematic personal portfolio for Ali Alkinani — Saudi engineer building AI systems from an offshore platform in the Gulf.

## Stack
- Vite + React 19 + TypeScript + Tailwind v4
- Motion (Framer) — interactions, scroll parallax, magnetic hover
- Higgsfield — 3 cinematic photographs (silhouette, hands, horizon)
- Cloudflare Pages + Pages Functions — deploy
- Cloudflare Workers AI (Llama 3.3 70B) — `/api/chat` real conversation
- Bilingual — Arabic primary, English toggle, persisted in localStorage

## Sections
1. Hero — full-bleed photographic, magazine-cover composition
2. /01 Origin — 5 years offshore story, count-up stats
3. /02 Ventures — Bithrah, Codad, Syndra (magnetic hover)
4. /03 Method — Design → Direct AI → Ship
5. /04 Ask Ali — real AI conversation streamed from Workers AI
6. /05 Stack — infra/lang/AI/ops
7. /06 Contact — Email · WhatsApp · X · LinkedIn · Bithrah

## Interactive
- Click the hero ocean → ripples
- Magnetic cursor on desktop
- Scroll progress bar (top)
- Type `alk` anywhere → secret panel (direct Telegram)
- Real chat with system prompt as Ali's Najdi Saudi voice

## Local development
```bash
npm install
npm run dev                  # frontend on :5173
node dev-server/server.mjs   # chat backend on :8787 (uses local claude CLI)
```

## Deploy (Cloudflare Pages)
```bash
npm run build
npx wrangler pages deploy dist --project-name alkinani-site
```
The `functions/api/chat.ts` handler is auto-deployed as a Pages Function and uses the AI binding from `wrangler.toml`.

## Author
Ali Alkinani — bithrah.sa · codad.co · WhatsApp +966 59 998 8522
