// Lemon Squeezy payment integration for Turjuman.
//
// Tiers map to Lemon variant IDs (set in .env). The mapping lives here so
// the rest of the code only deals with semantic tier names. We deliberately
// pin the variant IDs in env so a Lemon dashboard rename doesn't drift.

import crypto from "node:crypto";

// Tier → minutes granted on successful order. Prices are display-only — the
// authoritative price comes from Lemon at checkout time.
export const TURJUMAN_TIERS = {
  starter: { minutes: 60,  price_sar: 14,  label: "Starter" },
  pro:     { minutes: 300, price_sar: 49,  label: "Pro" },
  studio:  { minutes: 1000, price_sar: 149, label: "Studio" },
};

// 6 months — long enough to feel generous, short enough to bound liability.
export const CREDIT_LIFETIME_MS = 6 * 30 * 24 * 60 * 60 * 1000;

const LEMON_BASE = "https://api.lemonsqueezy.com/v1";

/**
 * Look up the Lemon variant ID for a tier from the env. Returns null if not
 * configured — callers should 503 rather than crash.
 */
export function variantIdForTier(tier) {
  const id =
    tier === "starter" ? process.env.LEMON_TURJUMAN_STARTER :
    tier === "pro"     ? process.env.LEMON_TURJUMAN_PRO :
    tier === "studio"  ? process.env.LEMON_TURJUMAN_STUDIO :
    null;
  return id ? String(id) : null;
}

/**
 * Create a Lemon Squeezy checkout for a given user + tier. Returns the
 * hosted checkout URL the browser should open.
 *
 * We pass `custom.user_id` + `custom.tier` so the webhook can reverse-map
 * the order back to our user + which credit pack to grant. Email is
 * pre-filled when we know it (signed-in users) so the buyer doesn't retype.
 */
export async function createCheckout({ tier, userId, email, baseUrl }) {
  const lemonKey = process.env.LEMON_API_KEY;
  const storeId = process.env.LEMON_STORE_ID;
  const variantId = variantIdForTier(tier);
  if (!lemonKey || !storeId) throw new Error("lemon_not_configured");
  if (!variantId) throw new Error(`tier_${tier}_not_configured`);

  const successUrl = `${baseUrl}/tools/turjuman?paid=${encodeURIComponent(tier)}`;

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: email || undefined,
          custom: {
            user_id: String(userId),
            tier,
          },
        },
        product_options: {
          redirect_url: successUrl,
          receipt_button_text: "العودة لـ ترجمان",
          receipt_thank_you_note: "كريدتك جاهز. ارجع للأداة وابدأ ترجمة جديدة.",
        },
        checkout_options: {
          embed: false,
          dark: true,
          logo: true,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(storeId) } },
        variant: { data: { type: "variants", id: String(variantId) } },
      },
    },
  };

  const r = await fetch(`${LEMON_BASE}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.api+json",
      "Accept": "application/vnd.api+json",
      "Authorization": `Bearer ${lemonKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`lemon_${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  const url = j?.data?.attributes?.url;
  if (!url) throw new Error("lemon_no_checkout_url");
  return url;
}

/**
 * Verify the X-Signature header against the raw request body using HMAC-SHA256
 * with the configured webhook secret. Timing-safe.
 *
 * Lemon signs with the *exact* raw bytes that hit our endpoint, so we MUST
 * receive the body as a Buffer (not parsed JSON) for this to match.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.LEMON_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(signatureHeader), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Map a Lemon variant ID (from a webhook payload) back to our tier label.
 * Returns null if the variant isn't one we issued — those should be ignored
 * (e.g. Codad SaaS subscriptions sharing the same store).
 */
export function tierFromVariantId(variantId) {
  if (!variantId) return null;
  const s = String(variantId);
  if (s === String(process.env.LEMON_TURJUMAN_STARTER || "")) return "starter";
  if (s === String(process.env.LEMON_TURJUMAN_PRO     || "")) return "pro";
  if (s === String(process.env.LEMON_TURJUMAN_STUDIO  || "")) return "studio";
  return null;
}
