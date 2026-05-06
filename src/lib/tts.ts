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

export async function speak(opts: SpeakOptions): Promise<SpeakHandle> {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!synth) {
    opts.onError?.("speech synthesis not supported");
    return { stop: () => {} };
  }
  await whenVoicesReady();
  const voice = pickBestVoice(opts.lang);
  const chunks = chunk(opts.text);
  if (chunks.length === 0) return { stop: () => {} };

  let cancelled = false;
  let currentIdx = 0;
  synth.cancel();

  const speakNext = () => {
    if (cancelled) return;
    if (currentIdx >= chunks.length) {
      opts.onEnd?.();
      return;
    }
    const text = chunks[currentIdx];
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = opts.lang === "ar" ? "ar-SA" : "en-US";
    // Rate tuning — slightly slower for Arabic = clearer phonemes.
    u.rate = opts.lang === "ar" ? 0.96 : 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.onstart = () => {
      if (currentIdx === 0) opts.onStart?.();
      opts.onChunk?.(currentIdx, chunks.length, text);
    };
    u.onend = () => {
      if (cancelled) return;
      currentIdx += 1;
      // Tiny pause between sentences for realism
      setTimeout(speakNext, 70);
    };
    u.onerror = (e) => {
      if (cancelled) return;
      const err = (e as SpeechSynthesisErrorEvent).error || "synth error";
      // ignore "interrupted" — it's just a cancel
      if (err === "interrupted" || err === "canceled") return;
      opts.onError?.(err);
    };
    synth.speak(u);
  };

  speakNext();

  return {
    stop: () => {
      cancelled = true;
      synth.cancel();
      opts.onEnd?.();
    },
  };
}

// Tiny helper for the UI: given an audio "level" 0..1 (we fake it from chunk
// progress), return a CSS waveform.
export function progressLevel(chunkIndex: number, totalChunks: number): number {
  if (totalChunks === 0) return 0;
  return Math.min(1, (chunkIndex + 1) / totalChunks);
}
