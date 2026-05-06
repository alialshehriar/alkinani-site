// Browser TTS helpers — picks the highest-quality voice the OS exposes,
// chunks text into sentences for natural pacing, and exposes a play/stop API
// with progress callbacks so the UI can show a real waveform.

type Lang = "ar" | "en";

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesReady = false;
const voiceListeners: Array<() => void> = [];

if (typeof window !== "undefined" && window.speechSynthesis) {
  const refresh = () => {
    cachedVoices = window.speechSynthesis.getVoices();
    if (cachedVoices.length > 0) {
      voicesReady = true;
      voiceListeners.splice(0).forEach((fn) => fn());
    }
  };
  refresh();
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
}

export function whenVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([]);
  if (voicesReady) return Promise.resolve(cachedVoices);
  return new Promise((resolve) => {
    voiceListeners.push(() => resolve(cachedVoices));
    // Safari fires this only after a user gesture sometimes. Cap timeout.
    setTimeout(() => {
      cachedVoices = window.speechSynthesis.getVoices();
      voicesReady = true;
      resolve(cachedVoices);
    }, 800);
  });
}

// Names of voices that are confirmed high-quality across platforms.
// Listed in priority order — first match wins.
const PREFERRED = {
  ar: [
    "Maryam (Enhanced)",       // iOS/macOS premium, near-human
    "Maryam (Premium)",
    "Maryam",
    "Naayf",
    "Hoda",
    "Tarik",
    "Google عربي",             // Chrome desktop
    "Microsoft Hamed Online",  // Edge / Windows
    "Microsoft Naayf Online",
  ],
  en: [
    "Samantha (Enhanced)",
    "Samantha (Premium)",
    "Samantha",
    "Karen (Enhanced)",
    "Karen (Premium)",
    "Karen",
    "Daniel (Enhanced)",
    "Daniel",
    "Google US English",
    "Microsoft Aria Online",
    "Microsoft Jenny Online",
  ],
} as const;

export function pickBestVoice(lang: Lang): SpeechSynthesisVoice | null {
  const tag = lang === "ar" ? "ar" : "en";
  const candidates = cachedVoices.filter((v) => v.lang.toLowerCase().startsWith(tag));
  if (candidates.length === 0) return null;

  // 1. Try the named preferred list (exact matches).
  for (const name of PREFERRED[lang]) {
    const found = candidates.find((v) => v.name === name);
    if (found) return found;
  }
  // 2. Try "Enhanced" / "Premium" tagged voices (Apple naming).
  const enhanced = candidates.find((v) => /enhanced|premium|neural/i.test(v.name));
  if (enhanced) return enhanced;
  // 3. Prefer regional voices matching ar-SA or en-US specifically.
  const regional = candidates.find((v) => {
    const t = v.lang.toLowerCase();
    return lang === "ar" ? t === "ar-sa" : t === "en-us";
  });
  if (regional) return regional;
  // 4. Default voice for the lang.
  const def = candidates.find((v) => v.default);
  if (def) return def;
  // 5. Fall back to first candidate.
  return candidates[0];
}

// Strip markdown / disallowed glyphs so the synth doesn't read them out loud.
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")     // code blocks
    .replace(/`([^`]+)`/g, "$1")          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link](url) -> link
    .replace(/[*_~#>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Split into sentence-ish chunks for natural pacing.
function chunk(text: string): string[] {
  const t = cleanForSpeech(text);
  if (!t) return [];
  const parts: string[] = [];
  // split on sentence boundaries while keeping punctuation
  const re = /[^.!?؟\n،,]+[.!?؟\n،,]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const s = m[0].trim();
    if (s) parts.push(s);
  }
  // Re-join very short pieces with the next so we don't have ultra-fast micro-utterances.
  const merged: string[] = [];
  for (const p of parts) {
    if (merged.length > 0 && (merged[merged.length - 1].length < 18 || p.length < 18)) {
      merged[merged.length - 1] = merged[merged.length - 1] + " " + p;
    } else {
      merged.push(p);
    }
  }
  return merged;
}

export interface SpeakHandle {
  stop: () => void;
}

export interface SpeakOptions {
  lang: Lang;
  text: string;
  onStart?: () => void;
  onChunk?: (chunkIndex: number, totalChunks: number, chunkText: string) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

/**
 * Try the server TTS endpoint first (ElevenLabs near-human voice).
 * If it returns audio, play via HTMLAudioElement (much higher quality than browser synth).
 * If it returns 204 (no key configured) or any error, returns null so caller falls back.
 */
async function tryServerTTS(opts: SpeakOptions): Promise<SpeakHandle | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanForSpeech(opts.text), lang: opts.lang }),
    });
    if (res.status === 204) return null; // backend signaled fallback
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("audio/")) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    const objUrl = URL.createObjectURL(blob);
    const audio = new Audio(objUrl);
    audio.preload = "auto";

    let cancelled = false;
    const cleanup = () => {
      try { audio.pause(); } catch { /* ignore */ }
      URL.revokeObjectURL(objUrl);
    };

    audio.addEventListener("playing", () => {
      if (!cancelled) opts.onStart?.();
    });

    audio.addEventListener("timeupdate", () => {
      if (cancelled || !audio.duration || !isFinite(audio.duration)) return;
      const pct = audio.currentTime / audio.duration;
      // Map continuous progress to 'chunks' the UI already expects (10 buckets).
      const buckets = 10;
      const chunkIdx = Math.min(buckets - 1, Math.floor(pct * buckets));
      opts.onChunk?.(chunkIdx, buckets, "");
    });

    audio.addEventListener("ended", () => {
      if (cancelled) return;
      opts.onEnd?.();
      cleanup();
    });

    audio.addEventListener("error", () => {
      if (cancelled) return;
      opts.onError?.("audio playback error");
      cleanup();
    });

    // Begin playback (must be in a user-gesture call chain to avoid mobile autoplay block)
    try {
      await audio.play();
    } catch (e) {
      cleanup();
      opts.onError?.(`play blocked: ${(e as Error)?.message || "unknown"}`);
      return null;
    }

    return {
      stop: () => {
        cancelled = true;
        cleanup();
        opts.onEnd?.();
      },
    };
  } catch {
    return null;
  }
}

// Cache of the /api/tts configuration probe — null until first check.
let ttsConfigured: boolean | null = null;

export async function isHighQualityTTSConfigured(): Promise<boolean> {
  if (ttsConfigured !== null) return ttsConfigured;
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/tts", { method: "GET" });
    if (!res.ok) {
      ttsConfigured = false;
      return false;
    }
    const data = (await res.json()) as { configured?: boolean };
    ttsConfigured = !!data.configured;
    return ttsConfigured;
  } catch {
    ttsConfigured = false;
    return false;
  }
}

export async function speak(opts: SpeakOptions): Promise<SpeakHandle> {
  // High-quality only. If the server TTS isn't configured, do nothing —
  // upstream UI should already be hiding the play button via the probe.
  // Browser speech-synthesis fallback intentionally disabled because it
  // produces robotic Arabic that hurts the brand.
  const server = await tryServerTTS(opts);
  if (server) return server;
  opts.onError?.("voice not configured");
  return { stop: () => {} };
}

// Mark these helpers as used by future expansions (kept for completeness).
void pickBestVoice;
void chunk;
void whenVoicesReady;

// Tiny helper for the UI: given an audio "level" 0..1 (we fake it from chunk
// progress), return a CSS waveform.
export function progressLevel(chunkIndex: number, totalChunks: number): number {
  if (totalChunks === 0) return 0;
  return Math.min(1, (chunkIndex + 1) / totalChunks);
}
