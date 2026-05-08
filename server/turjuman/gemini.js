// Gemini 2.5 Pro multimodal client. Uploads a video file and asks the
// model to produce time-coded subtitle cues translated into the target
// language.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta";

const PROMPT = (targetLang) => `
You are a professional subtitle translator.

Watch the attached video. Produce a JSON array of subtitle cues. Each cue
must have:
- "start": seconds, float, when the line starts
- "end": seconds, float, when the line ends
- "text": the spoken line translated into the target language

Target language: ${targetLang}

Language conventions:
- Arabic (ar): use Arabic script, Arabic punctuation (، and ؛). Use Arabic
  numerals (٠١٢٣) for narrative numbers, keep Latin numerals for product/
  version names. Modern Standard Arabic by default. Preserve Najdi/Hijazi
  flavor when source is colloquial Arabic.
- English (en): natural conversational English, sentence case.
- Spanish (es): natural conversational Spanish.

Rules:
- Each cue ≤ 7 seconds and ≥ 0.6 seconds.
- Each cue text ≤ 84 characters Latin OR ≤ 44 characters Arabic.
- Break at natural sentence boundaries; do NOT break inside جار+مجرور or
  مضاف+إليه (Arabic).
- Preserve product/brand names verbatim (Postgres, OpenAI, etc.).
- Mark non-speech audio: ♪ for music, (laughter) / (ضحك) for laughter.
- Output ONLY the JSON array. No prose, no markdown fences.
`.trim();

/**
 * Upload `videoBytes` to Gemini Files API + run generateContent.
 * Returns parsed cues array.
 */
export async function translateVideo({ apiKey, videoBytes, mimeType, targetLang }) {
  if (!apiKey) throw new Error("missing_gemini_key");

  // 1. Upload to the Files API (resumable upload protocol).
  const startRes = await fetch(`${UPLOAD_BASE}/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(videoBytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "turjuman.mp4" } }),
  });
  if (!startRes.ok) {
    throw new Error(`gemini_upload_start: ${startRes.status} ${(await startRes.text()).slice(0, 200)}`);
  }
  const uploadUrl =
    startRes.headers.get("X-Goog-Upload-URL") ??
    startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    const headerDump = [...startRes.headers.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    throw new Error(`gemini_upload_no_url: headers=${headerDump.slice(0, 200)}`);
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(videoBytes.byteLength),
    },
    body: videoBytes,
  });
  if (!uploadRes.ok) {
    throw new Error(`gemini_upload_body: ${uploadRes.status} ${(await uploadRes.text()).slice(0, 200)}`);
  }
  const uploaded = await uploadRes.json();
  const fileUri = uploaded?.file?.uri;
  if (!fileUri) throw new Error("gemini_upload_no_uri");

  // 2. Wait until the file is in ACTIVE state (large videos can take a few sec).
  await waitFileActive(uploaded.file.name, apiKey);

  // 3. generateContent.
  const genUrl = `${API_BASE}/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
  const genBody = {
    contents: [{
      role: "user",
      parts: [
        { text: PROMPT(targetLang) },
        { fileData: { mimeType, fileUri } },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };
  const genRes = await fetch(genUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(genBody),
  });
  if (!genRes.ok) {
    throw new Error(`gemini_gen_failed: ${genRes.status} ${(await genRes.text()).slice(0, 300)}`);
  }
  const data = await genRes.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`gemini_empty_response: ${JSON.stringify(data).slice(0, 300)}`);

  return parseCues(text);
}

async function waitFileActive(name, apiKey, attempts = 30, intervalMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${API_BASE}/${name}?key=${apiKey}`);
    if (res.ok) {
      const info = await res.json();
      if (info?.state === "ACTIVE") return;
      if (info?.state === "FAILED") throw new Error("gemini_file_state_failed");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("gemini_file_active_timeout");
}

/**
 * Parse Gemini's JSON-array response into cues. Strips markdown fences and
 * filters malformed entries.
 */
export function parseCues(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let arr;
  try { arr = JSON.parse(cleaned); } catch (e) {
    throw new Error(`gemini_json_parse: ${String(e).slice(0, 100)}; head=${cleaned.slice(0, 100)}`);
  }
  if (!Array.isArray(arr)) throw new Error("gemini_not_array");

  const cues = arr.filter((c) =>
    typeof c?.start === "number" &&
    typeof c?.end === "number" &&
    typeof c?.text === "string" &&
    c.end > c.start
  );
  if (cues.length === 0) throw new Error("gemini_no_cues");
  return cues;
}
