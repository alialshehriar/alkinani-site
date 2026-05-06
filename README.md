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
3. /02 Play — three brain games: Reflex Lab, Tech Sprint, Pulse
4. /03 Ventures — Bithrah, Codad, Syndra (magnetic hover)
5. /04 Ask Ali — real AI conversation streamed from Workers AI
6. /05 Method — Design → Direct AI → Ship
7. /06 Stack — infra/lang/AI/ops
8. /07 Contact — Email · WhatsApp · X · LinkedIn · Bithrah

## Interactive
- Click the hero ocean → ripples
- Magnetic cursor on desktop
- Scroll progress bar (top)
- Type `alk` anywhere → secret panel (direct Telegram)
- 3 brain games: founder DNA (Reflex Lab), speed quiz (Tech Sprint), memory grid (Pulse) — all with localStorage stats and AI-personalized results
- Real chat with system prompt as Ali's Najdi Saudi voice
- Near-human voice playback via ElevenLabs proxy (with browser-TTS fallback)

## TTS — high-quality voice (optional, paid)
The chat plays AI replies as audio. By default the browser's built-in
synth is used; quality varies. To upgrade to near-human voice via
ElevenLabs (`eleven_multilingual_v2` handles Najdi Arabic and English in
the same model), add the API key as a Cloudflare Pages secret:

```bash
# get a key from https://elevenlabs.io (free tier: 10k chars/month)
wrangler pages secret put ELEVENLABS_API_KEY --project-name alkinani-site

# (optional) override the default voice IDs
wrangler pages secret put ELEVENLABS_VOICE_AR --project-name alkinani-site
wrangler pages secret put ELEVENLABS_VOICE_EN --project-name alkinani-site
```

Once set, `/api/tts` streams MP3 audio per assistant reply; the frontend
plays it via HTMLAudioElement. With no key, the endpoint returns 204 and
the frontend transparently falls back to the browser's `speechSynthesis`.

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
