// Both pages.dev (legacy shipped link) and alkinani.live (new home) serve
// the site directly — no redirect. This guarantees the link Ali published on
// X (https://alkinani-site.pages.dev/#lab) works on every mobile browser
// regardless of DNS/cert state on the new origin.
//
// Force no-store so any phone that previously cached the bad 301 redirect
// invalidates it on next request.

export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const headers = new Headers(response.headers);
  // Bust any previously-cached 301 redirect from earlier deploys.
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
