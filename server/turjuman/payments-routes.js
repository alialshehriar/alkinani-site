// Express router for /api/turjuman/payments/*
//
// Two endpoints:
//   POST /create-checkout  → returns hosted Lemon Squeezy checkout URL
//   POST /webhook          → Lemon-signed webhook for order events
//
// Webhook security:
//   1. HMAC-SHA256 signature on raw body via X-Signature header (mandatory).
//   2. Idempotency via UNIQUE(lemon_order_id) in turjuman_credits_log —
//      replays are no-ops, never double-credit.
//   3. Only event types we handle are accepted. Variant ID must match one
//      of our configured Turjuman tiers — Codad SaaS subscriptions in the
//      same store are filtered out.

import express from "express";
import {
  TURJUMAN_TIERS,
  CREDIT_LIFETIME_MS,
  createCheckout,
  verifyWebhookSignature,
  tierFromVariantId,
} from "./payments.js";
import {
  readSession,
  getUserById,
  grantCreditsFromLemonOrder,
  reverseCreditsFromLemonOrder,
} from "./db.js";
import { readSessionCookie } from "./auth.js";

export function paymentsRouter({ db, q, baseUrl }) {
  const router = express.Router();

  // POST /create-checkout — must be signed-in (anon users see the
  // PaywallModal which directs them to register first).
  router.post("/create-checkout", async (req, res) => {
    const tier = String(req.body?.tier || "").toLowerCase();
    if (!TURJUMAN_TIERS[tier]) {
      return res.status(400).json({ error: "invalid_tier" });
    }

    const sid = readSessionCookie(req);
    if (!sid) return res.status(401).json({ error: "unauthenticated" });
    const session = readSession(q, sid);
    if (!session) return res.status(401).json({ error: "session_expired" });
    const user = getUserById(q, session.user_id);
    if (!user) return res.status(401).json({ error: "user_missing" });

    try {
      const url = await createCheckout({
        tier,
        userId: user.id,
        email: user.email,
        baseUrl,
      });
      return res.json({ url });
    } catch (e) {
      const msg = String(e?.message ?? e);
      console.warn("[turjuman/payments] checkout failed:", msg);
      const code = msg.startsWith("tier_") ? "tier_unavailable"
                  : msg === "lemon_not_configured" ? "payments_disabled"
                  : "checkout_failed";
      return res.status(502).json({ error: code });
    }
  });

  // POST /webhook — Lemon Squeezy server-to-server.
  //
  // Server.mjs captures req.rawBody via the express.json() verify hook so
  // we can compute HMAC over the exact bytes Lemon signed. Without that the
  // parsed/normalized body would never match Lemon's signature.
  router.post("/webhook", (req, res) => {
      const sig = req.headers["x-signature"];
      const raw = req.rawBody;
      if (!raw) {
        console.warn("[turjuman/payments] webhook missing raw body");
        return res.status(500).json({ error: "raw_body_missing" });
      }
      const ok = verifyWebhookSignature(raw, sig);
      if (!ok) {
        console.warn("[turjuman/payments] webhook bad signature");
        return res.status(401).json({ error: "bad_signature" });
      }

      // express.json() already parsed the body; req.body is the JSON object.
      const payload = req.body;
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ error: "bad_json" });
      }

      const eventName = payload?.meta?.event_name;
      const customData = payload?.meta?.custom_data || {};
      const orderId = String(payload?.data?.id ?? "").trim();
      const orderAttrs = payload?.data?.attributes || {};
      const variantId = orderAttrs?.first_order_item?.variant_id
                     ?? orderAttrs?.variant_id
                     ?? null;

      // Reject events we don't care about, but ack with 200 so Lemon stops
      // retrying. Returning 4xx triggers their exponential-backoff retry.
      if (!orderId) {
        return res.status(200).json({ ignored: "no_order_id" });
      }

      if (eventName === "order_created" || eventName === "order_paid") {
        // Lemon's "order_created" already implies paid for one-time products
        // in their default flow. We treat both the same for credit grant.
        const tier = customData?.tier
                  || tierFromVariantId(variantId);
        const userId = customData?.user_id;

        if (!tier || !userId) {
          console.warn("[turjuman/payments] order without tier/user_id:",
                       eventName, orderId, { tier, userId, variantId });
          return res.status(200).json({ ignored: "not_turjuman_product" });
        }
        const minutes = TURJUMAN_TIERS[tier]?.minutes;
        if (!minutes) {
          return res.status(200).json({ ignored: "unknown_tier" });
        }

        const user = getUserById(q, userId);
        if (!user) {
          // Probably a dev-mode test where the buyer is logged in elsewhere.
          // Don't crash the webhook; just log and ack.
          console.warn("[turjuman/payments] webhook for unknown user:", userId);
          return res.status(200).json({ ignored: "unknown_user" });
        }

        const applied = grantCreditsFromLemonOrder(db, q, {
          userId,
          minutes,
          lemonOrderId: `lemon:${orderId}`,
          expiresAt: Date.now() + CREDIT_LIFETIME_MS,
          reason: `${eventName}:${tier}`,
        });
        console.log(
          `[turjuman/payments] ${eventName} order=${orderId} user=${userId} tier=${tier} +${minutes}min applied=${applied}`
        );
        return res.status(200).json({ ok: true, applied, minutes });
      }

      if (eventName === "order_refunded") {
        const refundAmt = Number(orderAttrs?.refunded_amount ?? orderAttrs?.total ?? 0) / 100;
        const reversed = reverseCreditsFromLemonOrder(db, q, {
          lemonOrderId: `lemon:${orderId}`,
          refundAmountSar: refundAmt || null,
        });
        console.log(`[turjuman/payments] refund order=${orderId} reversed=${reversed}`);
        return res.status(200).json({ ok: true, reversed });
      }

      // Subscription events (from Codad SaaS) and others — ack and ignore.
      return res.status(200).json({ ignored: eventName });
  });

  // GET /tiers — public catalog so the front-end can list price/minutes
  // without re-hardcoding them.
  router.get("/tiers", (_req, res) => {
    const tiers = Object.entries(TURJUMAN_TIERS).map(([id, t]) => ({
      id,
      label: t.label,
      minutes: t.minutes,
      price_sar: t.price_sar,
      configured: !!process.env[`LEMON_TURJUMAN_${id.toUpperCase()}`],
    }));
    res.json({ tiers });
  });

  return router;
}
