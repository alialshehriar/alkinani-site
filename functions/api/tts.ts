// Cloudflare Pages Function: /api/tts
// Streams near-human-quality TTS audio from ElevenLabs (eleven_multilingual_v2),
// which handles Najdi Arabic and English in the same model.
//
// POST { text: string, lang: "ar" | "en", voice?: string }
//   200 -> audio/mpeg stream (cached at edge for 1 day per text+voice)
//   204 -> {"fallback":"browser"} JSON (no key configured, frontend falls back)
//   400 -> {"error":"..."}
//
// Set the secret in Cloudflare Pages:
//   wrangler pages secret put ELEVENLABS_API_KEY --project-name alkinani-site
//
// Optional secrets:
//   ELEVENLABS_VOICE_AR  (defaults to Antoni — good multilingual male voice)
//   ELEVENLABS_VOICE_EN  (defaults to same)
//   ELEVENLABS_MODEL     (defaults to eleven_multilingual_v2)

interface Env {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_AR?: string;
  ELEVENLABS_VOICE_EN?: string;
  ELEVENLABS_MODEL?: string;
}

interface Body {
  text?: string;
  lang?: "ar" | "en";
  voice?: string;
}

// Default voice IDs from ElevenLabs's stock library.
// Antoni (warm male, neutral accent — works well for Arabic via multilingual_v2)
const DEFAULT_VOICE = "ErXwobaYiN019PkySvjV";
const DEFAULT_MODEL = "eleven_multilingual_v2";

function setCORS(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

export const onRequestOptions: PagesFunction = async () => {
  const headers = new Headers();
  setCORS(headers);
  return new Response(null, { status: 204, headers });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("invalid json", 400);
  }

  const text = (body.text || "").trim();
  if (!text) return jsonError("text required", 400);
  if (text.length > 1500) return jsonError("text too long (max 1500 chars)", 400);

  // No key? Tell frontend to fall back to browser TTS.
  if (!env.ELEVENLABS_API_KEY) {
    return jsonResponse({ fallback: "browser", reason: "no api key" }, 204);
  }

  const lang = body.lang === "en" ? "en" : "ar";
  const voiceId =
    body.voice ||
    (lang === "ar" ? env.ELEVENLABS_VOICE_AR : env.ELEVENLABS_VOICE_EN) ||
    DEFAULT_VOICE;
  const model = env.ELEVENLABS_MODEL || DEFAULT_MODEL;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?optimize_streaming_latency=2&output_format=mp3_44100_128`;

  const elevenRes = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        // Tuned for: natural prosody, Arabic phoneme stability, expressive range.
        stability: 0.45,
        similarity_boost: 0.78,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!elevenRes.ok) {
    const txt = await elevenRes.text().catch(() => "");
    return jsonError(`elevenlabs ${elevenRes.status}: ${txt.slice(0, 200)}`, 502);
  }

  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    // Cache aggressively: same text + voice always produces identical audio.
    "Cache-Control": "public, max-age=86400, immutable",
  });
  setCORS(headers);
  return new Response(elevenRes.body, { headers, status: 200 });
};

function jsonError(msg: string, status = 400) {
  const headers = new Headers({ "Content-Type": "application/json" });
  setCORS(headers);
  return new Response(JSON.stringify({ error: msg }), { status, headers });
}

function jsonResponse(payload: unknown, status = 200) {
  const headers = new Headers({ "Content-Type": "application/json" });
  setCORS(headers);
  return new Response(JSON.stringify(payload), { status, headers });
}
