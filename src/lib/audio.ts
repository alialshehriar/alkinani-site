// Tiny Web Audio helper — pleasant tone bank for the Pulse game.
// Lazy-init AudioContext (mobile requires user-gesture before audio works).

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// 16 musical-ish frequencies arranged so adjacent grid cells aren't dissonant.
// Pentatonic-ish sequence rising — pleasant regardless of order.
const FREQS = [
  261.63, 293.66, 329.63, 349.23,   // row 1: C4 D4 E4 F4
  392.00, 440.00, 493.88, 523.25,   // row 2: G4 A4 B4 C5
  587.33, 659.25, 698.46, 783.99,   // row 3: D5 E5 F5 G5
  880.00, 987.77, 1046.50, 1174.66, // row 4: A5 B5 C6 D6
];

export function playCellTone(idx: number, durationMs = 320, gainScale = 1) {
  const c = ensureCtx();
  if (!c) return;
  const freq = FREQS[Math.max(0, Math.min(15, idx))];
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const now = c.currentTime;
  const peak = 0.18 * gainScale;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.05);
}

export function playSuccess() {
  const c = ensureCtx();
  if (!c) return;
  // Major triad arpeggio
  const tones = [523.25, 659.25, 783.99, 1046.50];
  tones.forEach((f, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    const t0 = c.currentTime + i * 0.07;
    osc.connect(gain);
    gain.connect(c.destination);
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.34);
    osc.start(t0);
    osc.stop(t0 + 0.4);
  });
}

export function playFail() {
  const c = ensureCtx();
  if (!c) return;
  // Descending minor 3rd buzz
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  const now = c.currentTime;
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.5);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.6);
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}
