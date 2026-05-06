// pages.dev now serves the site directly (legacy redirect removed) so any
// previously-shipped *.pages.dev links keep working until the alkinani.live
// migration to Hostinger VPS finishes propagating + Let's Encrypt cert lands.
//
// Once alkinani.live is fully live with valid cert, this can be re-enabled to
// 301 pages.dev → alkinani.live. For now: no-op pass-through.

export const onRequest: PagesFunction = async (context) => {
  return await context.next();
};
