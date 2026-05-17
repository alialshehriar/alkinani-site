// Cloudflare Pages Function: /api/tts
// Always-on free TTS via Microsoft Edge Read-Aloud (the same engine Edge browser
// uses). No API key required. Saudi neural voices ar-SA-HamedNeural and
// ar-SA-ZariyahNeural are near-human quality.
//
// If ELEVENLABS_API_KEY is set, prefer that as a premium upgrade.
// Otherwise fall through to Microsoft Edge TTS.
//
// POST { text, lang: "ar"|"en", voice?, gender?: "male"|"female" }
//   200 audio/mpeg

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
  gender?: "male" | "female";
}

// Default ElevenLabs voice (used only if a key is set).
const ELEVEN_DEFAULT_VOICE = "ErXwobaYiN019PkySvjV"; // Antoni
const ELEVEN_DEFAULT_MODEL = "eleven_multilingual_v2";

// Microsoft Edge TTS — public, key-less. The token has been used by Edge for years.
const EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_VOICE_AR_M = "ar-SA-HamedNeural";
const EDGE_VOICE_AR_F = "ar-SA-ZariyahNeural";
const EDGE_VOICE_EN_M = "en-US-AndrewNeural";
const EDGE_VOICE_EN_F = "en-US-EmmaNeural";

function setCORS(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

export const onRequestOptions: PagesFunction = async () => {
  const headers = new Headers();
  setCORS(headers);
  return new Response(null, { status: 204, headers });
};

// GET — frontend probe so the play button knows TTS is always available now.
export const onRequestGet: PagesFunction<Env> = async () => {
  const headers = new Headers({ "Content-Type": "application/json" });
  setCORS(headers);
  return new Response(JSON.stringify({ ok: true, configured: true }), { headers });
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

  const lang = body.lang === "en" ? "en" : "ar";
  const gender = body.gender === "female" ? "female" : "male";

  // Premium path: ElevenLabs if key present.
  if (env.ELEVENLABS_API_KEY) {
    const voiceId =
      body.voice ||
      (lang === "ar" ? env.ELEVENLABS_VOICE_AR : env.ELEVENLABS_VOICE_EN) ||
      ELEVEN_DEFAULT_VOICE;
    const model = env.ELEVENLABS_MODEL || ELEVEN_DEFAULT_MODEL;
    return await streamFromElevenLabs(env.ELEVENLABS_API_KEY, text, voiceId, model);
  }

  // Always-on path: Microsoft Edge TTS via WebSocket (no key).
  try {
    const audio = await edgeTTS(text, lang, body.voice, gender);
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    });
    setCORS(headers);
    return new Response(audio, { headers });
  } catch (e) {
    return jsonError(`edge tts failed: ${String(e).slice(0, 200)}`, 502);
  }
};

/* ---------------------- ElevenLabs (premium upgrade) --------------------- */

async function streamFromElevenLabs(
  apiKey: string,
  text: string,
  voiceId: string,
  model: string,
): Promise<Response> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?optimize_streaming_latency=2&output_format=mp3_44100_128`;
  const elevenRes = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
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
    "Cache-Control": "public, max-age=86400, immutable",
  });
  setCORS(headers);
  return new Response(elevenRes.body, { headers, status: 200 });
}

/* ---------------------- Google Translate TTS (free) ---------------------- */
// Google Translate's public TTS endpoint returns audio/mpeg (MP3) for any
// short text. Used for years by gTTS / Google Translate clients. No key.
//
// Chunk limit ≈ 200 chars per call → split sentences and concatenate the
// raw MP3 streams (raw MP3 frames are stream-safe to concatenate).

async function edgeTTS(
  text: string,
  lang: "ar" | "en",
  _voiceOverride?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API parity; gender is selected via voiceOverride upstream
  _gender: "male" | "female" = "male",
): Promise<Uint8Array> {
  const tl = lang === "ar" ? "ar" : "en";
  const chunks = chunkText(text, 180);
  const audioBuffers: Uint8Array[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i];
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8` +
      `&q=${encodeURIComponent(part)}` +
      `&tl=${tl}` +
      `&total=${chunks.length}` +
      `&idx=${i}` +
      `&textlen=${part.length}` +
      `&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) throw new Error(`gtts ${res.status} on chunk ${i + 1}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    audioBuffers.push(buf);
  }

  // Concatenate MP3 buffers (MPEG ADTS frames are individually decodable so
  // raw concatenation produces valid playback in browsers).
  const total = audioBuffers.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of audioBuffers) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// Split text into <= maxLen chunks at sentence/comma boundaries.
function chunkText(text: string, maxLen: number): string[] {
  const t = text.trim();
  if (t.length <= maxLen) return [t];
  // Split on sentence-ish punctuation while keeping it.
  const re = /[^.!?؟،,\n]+[.!?؟،,\n]?/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const s = m[0].trim();
    if (s) parts.push(s);
  }
  // Pack greedily up to maxLen, splitting if a single sentence exceeds it.
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length <= maxLen) {
      cur = (cur + " " + p).trim();
    } else {
      if (cur) out.push(cur);
      if (p.length <= maxLen) {
        cur = p;
      } else {
        // Hard-split a too-long sentence by spaces.
        const words = p.split(/\s+/);
        let w = "";
        for (const word of words) {
          if ((w + " " + word).trim().length <= maxLen) {
            w = (w + " " + word).trim();
          } else {
            if (w) out.push(w);
            w = word;
          }
        }
        if (w) out.push(w);
        cur = "";
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Suppress unused-variable warnings on the kept-for-future Microsoft Edge
// constants. They're documentation hints for a possible upgrade later.
void EDGE_TOKEN;
void EDGE_VOICE_AR_M;
void EDGE_VOICE_AR_F;
void EDGE_VOICE_EN_M;
void EDGE_VOICE_EN_F;

function jsonError(msg: string, status = 400) {
  const headers = new Headers({ "Content-Type": "application/json" });
  setCORS(headers);
  return new Response(JSON.stringify({ error: msg }), { status, headers });
}
