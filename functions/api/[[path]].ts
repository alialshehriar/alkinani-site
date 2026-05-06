// Catch-all proxy: forward every /api/* request from this pages.dev origin to
// the canonical Express server on the Hostinger VPS at alkinani.live.
//
// This lets the published pages.dev/#lab link work end-to-end on every device:
// the static React app comes from pages.dev (no DNS dependency on the new
// origin) but live state — chat, profile, leaderboard, TTS — flows through
// the real backend transparently.
//
// Streaming endpoints (SSE chat, audio TTS) work because we forward the
// upstream Response body directly without reading it into memory.

const ORIGIN = "https://alkinani.live";

export const onRequest: PagesFunction = async (context) => {
  const incoming = context.request;
  const inUrl = new URL(incoming.url);
  const target = `${ORIGIN}${inUrl.pathname}${inUrl.search}`;

  // Strip hop-by-hop headers and host so the upstream sees its own.
  const fwdHeaders = new Headers(incoming.headers);
  ["host", "connection", "content-length"].forEach((h) => fwdHeaders.delete(h));
  // Preserve client IP for the leaderboard rate-limiter.
  const clientIp = incoming.headers.get("cf-connecting-ip") || "";
  if (clientIp && !fwdHeaders.has("x-forwarded-for")) {
    fwdHeaders.set("x-forwarded-for", clientIp);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: incoming.method,
      headers: fwdHeaders,
      body: ["GET", "HEAD"].includes(incoming.method) ? undefined : incoming.body,
      // @ts-expect-error - Cloudflare-specific option to allow streaming bodies.
      duplex: "half",
      redirect: "manual",
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `proxy upstream unreachable: ${String(err).slice(0, 200)}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Pass through response untouched. Strip Cloudflare-side caching headers
  // since the origin already sets the right Cache-Control for each endpoint.
  const outHeaders = new Headers(upstream.headers);
  outHeaders.delete("cf-cache-status");
  outHeaders.delete("cf-ray");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
};
