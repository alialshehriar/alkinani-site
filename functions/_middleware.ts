// Catches every request before any route handler.
// Permanently redirects the legacy *.pages.dev origin to alkinani.live so old
// shared links (X / WhatsApp posts) hand off cleanly to the new domain.
// www.alkinani.live also collapses to the apex.

const NEW_HOST = "alkinani.live";

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  // Legacy preview / production *.pages.dev domain → permanent move.
  if (host.endsWith(".pages.dev")) {
    const target = `https://${NEW_HOST}${url.pathname}${url.search}${url.hash}`;
    return new Response(null, {
      status: 301,
      headers: {
        Location: target,
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  // www → apex (canonical host).
  if (host === `www.${NEW_HOST}`) {
    const target = `https://${NEW_HOST}${url.pathname}${url.search}${url.hash}`;
    return new Response(null, {
      status: 301,
      headers: {
        Location: target,
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  return await context.next();
};
