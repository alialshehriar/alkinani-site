// In-memory event bus for translation job progress.
//
// The pipeline emits stage transitions; SSE subscribers receive them in
// real time so the UI can show "downloading 40%" instead of "processing".
// Buffer is per-job (last N events) so a client that connects mid-flight
// can replay what already happened.

const BUFFER_MAX = 50;
const TTL_MS = 30 * 60 * 1000; // job lifecycle ceiling

// Map<jobId, { events: [], subscribers: Set<send>, expiresAt }>
const channels = new Map();

function getOrCreate(jobId) {
  let ch = channels.get(jobId);
  if (!ch) {
    ch = { events: [], subscribers: new Set(), expiresAt: Date.now() + TTL_MS };
    channels.set(jobId, ch);
  }
  return ch;
}

export function emitJobEvent(jobId, evt) {
  if (!jobId) return;
  const ch = getOrCreate(jobId);
  const stamped = { ...evt, t: Date.now() };
  ch.events.push(stamped);
  if (ch.events.length > BUFFER_MAX) ch.events.shift();
  ch.expiresAt = Date.now() + TTL_MS;
  for (const send of ch.subscribers) {
    try { send(stamped); } catch { /* drop dead subscribers */ }
  }
  // Auto-close stream on terminal events; subscriber teardown happens in route.
  if (evt.stage === "done" || evt.stage === "error") {
    setTimeout(() => channels.delete(jobId), 60_000).unref?.();
  }
}

export function subscribeToJob(jobId, send) {
  const ch = getOrCreate(jobId);
  // Replay buffered events so latecomers get the full story.
  for (const evt of ch.events) {
    try { send(evt); } catch { /* ignore */ }
  }
  ch.subscribers.add(send);
  return () => ch.subscribers.delete(send);
}

// Periodic GC for stuck channels (no terminal event ever fired).
setInterval(() => {
  const now = Date.now();
  for (const [id, ch] of channels) {
    if (ch.expiresAt < now && ch.subscribers.size === 0) {
      channels.delete(id);
    }
  }
}, 5 * 60 * 1000).unref?.();
