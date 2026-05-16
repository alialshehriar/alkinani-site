// Express router for /api/turjuman/* endpoints.
// Mounted from server.mjs via app.use("/api/turjuman", turjumanRouter(...))

import express from "express";
import crypto from "node:crypto";
import { isDisposable } from "./disposable-emails.js";
import { sendMagicLinkEmail } from "./email.js";
import {
  generateToken,
  isValidEmail,
  buildSessionCookie,
  buildClearSessionCookie,
  readSessionCookie,
} from "./auth.js";
import {
  getUserByEmail,
  getUserById,
  createUser,
  touchUser,
  storeMagicToken,
  consumeMagicToken,
  createSession,
  readSession,
  deleteSession,
  checkAndIncrementRateLimit,
  findOrCreateUserByGoogle,
  findOrCreateUserByApple,
  findOrCreateUserByPhone,
} from "./db.js";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  decodeGoogleIdToken,
  buildStateCookie,
  clearStateCookie,
  readStateCookie,
  verifyState,
} from "./oauth-google.js";
import {
  buildAppleAuthUrl,
  exchangeAppleCode,
  decodeAppleIdToken,
  buildAppleStateCookie,
  clearAppleStateCookie,
  readAppleStateCookie,
  verifyState as verifyAppleState,
} from "./oauth-apple.js";
import { sendPhoneOtp } from "./sms.js";

export function turjumanRouter({
  q,                  // queries object from makeQueries(db)
  resendApiKey,       // string | undefined
  resendFrom,         // e.g. "noreply@alkinani.live"
  baseUrl,            // e.g. "https://alkinani.live"
  isProduction,       // boolean — drives Secure cookie + redirect URL
  google,             // {clientId, clientSecret} or null
  apple,              // {teamId, keyId, serviceId, privateKeyPem} or null
  oauthSigningSecret, // for HMAC-signing OAuth state cookies
  smsConfig,          // {provider, ...} for phone OTP
}) {
  const router = express.Router();
  const googleRedirect = `${baseUrl}/api/turjuman/auth/google/callback`;
  const appleRedirect = `${baseUrl}/api/turjuman/auth/apple/callback`;

  // POST /api/turjuman/auth/magic-link  { email }
  router.post("/auth/magic-link", async (req, res) => {
    const email = (req.body?.email ?? "").trim().toLowerCase();

    if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });
    if (isDisposable(email)) return res.status(400).json({ error: "disposable_email" });

    // Per-IP 5/hr deters script abuse; per-email 3/hr limits inbox spam from
    // a single user retrying. Owners testing should clear DB row, not raise.
    const ip = req.ip || "unknown";
    const ipRl = checkAndIncrementRateLimit(q, `magic:ip:${ip}`, 5, 3600);
    if (!ipRl.allowed) return res.status(429).json({ error: "rate_limited" });
    const emailRl = checkAndIncrementRateLimit(q, `magic:email:${email}`, 3, 3600);
    if (!emailRl.allowed) return res.status(429).json({ error: "rate_limited" });

    const token = generateToken();
    storeMagicToken(q, token, email);

    const link = `${baseUrl}/api/turjuman/auth/verify?token=${token}`;
    const result = await sendMagicLinkEmail({
      apiKey: resendApiKey,
      from: resendFrom,
      to: email,
      link,
    });

    if (!result.ok) {
      console.error("[turjuman] send failed:", result.error);
      return res.status(502).json({ error: "email_failed" });
    }

    return res.json({ sent: true, devFallback: result.devFallback ?? false });
  });

  // GET /api/turjuman/auth/verify?token=…
  router.get("/auth/verify", (req, res) => {
    const token = req.query.token;
    if (typeof token !== "string" || !token) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=missing_token`);
    }

    const email = consumeMagicToken(q, token);
    if (!email) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=expired_or_used`);
    }

    let user = getUserByEmail(q, email);
    if (!user) {
      user = createUser(q, email);
    } else {
      touchUser(q, user.id);
    }

    const sessionId = createSession(q, user.id);
    res.set("Set-Cookie", buildSessionCookie(sessionId, isProduction));
    return res.redirect(`${baseUrl}/tools/turjuman`);
  });

  // POST /api/turjuman/auth/logout
  router.post("/auth/logout", (req, res) => {
    const sid = readSessionCookie(req);
    if (sid) deleteSession(q, sid);
    res.set("Set-Cookie", buildClearSessionCookie(isProduction));
    return res.json({ ok: true });
  });

  // GET /api/turjuman/auth/providers
  // Tells the front-end which sign-in methods are actually working on
  // this deployment so the UI can hide / badge the ones that aren't.
  //   - google / apple: enabled when client IDs are configured.
  //   - phone: enabled only when SMS_PROVIDER is set to a real backend
  //            (anything other than "console").
  //   - email_magic_link: enabled when both RESEND_API_KEY is set AND the
  //            sender domain (RESEND_FROM) is verified at Resend. We can't
  //            check the verify status synchronously, so we approximate via
  //            an env flag (RESEND_DOMAIN_VERIFIED=1) that the operator
  //            flips once Resend reports `status=verified`.
  router.get("/auth/providers", (_req, res) => {
    const provider = (process.env.SMS_PROVIDER || "console").trim();
    return res.json({
      google: !!google?.clientId && !!google?.clientSecret,
      apple: !!apple?.serviceId,
      phone: provider !== "console" && provider !== "",
      email_magic_link: !!process.env.RESEND_API_KEY && process.env.RESEND_DOMAIN_VERIFIED === "1",
    });
  });

  // GET /api/turjuman/auth/me
  router.get("/auth/me", (req, res) => {
    const sid = readSessionCookie(req);
    if (!sid) return res.status(401).json({ error: "unauthenticated" });

    const session = readSession(q, sid);
    if (!session) return res.status(401).json({ error: "session_expired" });

    const user = getUserById(q, session.user_id);
    if (!user) return res.status(401).json({ error: "user_not_found" });

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        credits_balance: user.credits_balance,
        free_credits_remaining: user.free_credits_remaining,
        display_name: user.display_name || null,
        avatar_url: user.avatar_url || null,
        phone: user.phone || null,
        has_password: false,
        has_google: !!user.google_id,
        has_apple: !!user.apple_id,
        has_phone: !!user.phone,
      },
    });
  });

  // ── Google OAuth ─────────────────────────────────────────────────────────
  router.get("/auth/google/start", (req, res) => {
    if (!google?.clientId) return res.status(503).json({ error: "google_not_configured" });
    const ip = req.ip || "unknown";
    const rl = checkAndIncrementRateLimit(q, `oauth_start:ip:${ip}`, 30, 600);
    if (!rl.allowed) return res.status(429).json({ error: "rate_limited" });
    const nonce = crypto.randomBytes(16).toString("hex");
    const { url, state } = buildGoogleAuthUrl({
      clientId: google.clientId,
      redirectUri: googleRedirect,
      statePayload: { nonce, ip },
      signingSecret: oauthSigningSecret,
    });
    res.set("Set-Cookie", buildStateCookie(state, isProduction));
    return res.redirect(url);
  });

  router.get("/auth/google/callback", async (req, res) => {
    if (!google?.clientId || !google?.clientSecret) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=google_not_configured`);
    }
    const cookieState = readStateCookie(req);
    const queryState = req.query.state;
    if (!cookieState || cookieState !== queryState) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=oauth_state_mismatch`);
    }
    const verified = verifyState(oauthSigningSecret, cookieState);
    if (!verified) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=oauth_state_invalid`);
    }
    if (req.query.error) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=google_${encodeURIComponent(String(req.query.error))}`);
    }
    const code = req.query.code;
    if (typeof code !== "string" || !code) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=oauth_no_code`);
    }
    try {
      const tokens = await exchangeGoogleCode({
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        redirectUri: googleRedirect,
        code,
      });
      const id = decodeGoogleIdToken(tokens.id_token);
      if (!id.email || !id.emailVerified) {
        return res.redirect(`${baseUrl}/tools/turjuman?error=google_email_unverified`);
      }
      const user = findOrCreateUserByGoogle(q, {
        sub: id.sub,
        email: id.email,
        name: id.name,
        picture: id.picture,
      });
      const sessionId = createSession(q, user.id);
      res.set("Set-Cookie", [
        buildSessionCookie(sessionId, isProduction),
        clearStateCookie(isProduction),
      ]);
      return res.redirect(`${baseUrl}/tools/turjuman`);
    } catch (err) {
      console.error("[turjuman/oauth] google callback failed:", err);
      return res.redirect(`${baseUrl}/tools/turjuman?error=google_exchange_failed`);
    }
  });

  // ── Apple Sign In ────────────────────────────────────────────────────────
  router.get("/auth/apple/start", (req, res) => {
    if (!apple?.serviceId) return res.status(503).json({ error: "apple_not_configured" });
    const ip = req.ip || "unknown";
    const rl = checkAndIncrementRateLimit(q, `oauth_start:ip:${ip}`, 30, 600);
    if (!rl.allowed) return res.status(429).json({ error: "rate_limited" });
    const nonce = crypto.randomBytes(16).toString("hex");
    const { url, state } = buildAppleAuthUrl({
      serviceId: apple.serviceId,
      redirectUri: appleRedirect,
      statePayload: { nonce, ip },
      signingSecret: oauthSigningSecret,
    });
    res.set("Set-Cookie", buildAppleStateCookie(state, isProduction));
    return res.redirect(url);
  });

  // Apple uses form_post mode → callback is POST. Accept both POST and GET so
  // local dev / testing can hit it via GET too.
  async function handleAppleCallback(req, res) {
    if (!apple?.serviceId || !apple?.privateKeyPem) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=apple_not_configured`);
    }
    const cookieState = readAppleStateCookie(req);
    const queryState = req.body?.state || req.query.state;
    if (!cookieState || cookieState !== queryState) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=apple_state_mismatch`);
    }
    if (!verifyAppleState(oauthSigningSecret, cookieState)) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=apple_state_invalid`);
    }
    const errParam = req.body?.error || req.query.error;
    if (errParam) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=apple_${encodeURIComponent(String(errParam))}`);
    }
    const code = req.body?.code || req.query.code;
    if (typeof code !== "string" || !code) {
      return res.redirect(`${baseUrl}/tools/turjuman?error=apple_no_code`);
    }
    // On first sign-in Apple posts a `user` JSON blob (only once, ever).
    let appleName = null;
    if (req.body?.user) {
      try {
        const parsed = JSON.parse(req.body.user);
        appleName = [parsed?.name?.firstName, parsed?.name?.lastName].filter(Boolean).join(" ") || null;
      } catch { /* ignore */ }
    }
    try {
      const tokens = await exchangeAppleCode({
        serviceId: apple.serviceId,
        teamId: apple.teamId,
        keyId: apple.keyId,
        privateKeyPem: apple.privateKeyPem,
        redirectUri: appleRedirect,
        code,
      });
      const id = decodeAppleIdToken(tokens.id_token);
      const user = findOrCreateUserByApple(q, {
        sub: id.sub,
        email: id.email,
        name: appleName,
      });
      const sessionId = createSession(q, user.id);
      res.set("Set-Cookie", [
        buildSessionCookie(sessionId, isProduction),
        clearAppleStateCookie(isProduction),
      ]);
      return res.redirect(`${baseUrl}/tools/turjuman`);
    } catch (err) {
      console.error("[turjuman/oauth] apple callback failed:", err);
      return res.redirect(`${baseUrl}/tools/turjuman?error=apple_exchange_failed`);
    }
  }
  router.post("/auth/apple/callback", express.urlencoded({ extended: false }), handleAppleCallback);
  router.get("/auth/apple/callback", handleAppleCallback);

  // ── Phone OTP ────────────────────────────────────────────────────────────
  // Saudi mobile: +9665XXXXXXXX  (12 chars after +). Generic E.164 also OK.
  function normalizePhone(raw) {
    if (typeof raw !== "string") return null;
    let s = raw.trim().replace(/[\s\-()]/g, "");
    if (s.startsWith("00")) s = "+" + s.slice(2);
    if (!s.startsWith("+")) {
      // Saudi local: 05XXXXXXXX → +9665XXXXXXXX
      if (/^0?5\d{8}$/.test(s)) s = "+966" + s.replace(/^0/, "");
      else return null;
    }
    if (!/^\+\d{8,15}$/.test(s)) return null;
    return s;
  }

  router.post("/auth/phone/request", async (req, res) => {
    if (!smsConfig?.provider) return res.status(503).json({ error: "sms_not_configured" });
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: "invalid_phone" });

    const ip = req.ip || "unknown";
    const ipRl = checkAndIncrementRateLimit(q, `otp:ip:${ip}`, 5, 3600);
    if (!ipRl.allowed) return res.status(429).json({ error: "rate_limited" });
    const phoneRl = checkAndIncrementRateLimit(q, `otp:phone:${phone}`, 3, 3600);
    if (!phoneRl.allowed) return res.status(429).json({ error: "rate_limited" });

    const code = String(crypto.randomInt(100000, 1000000)); // 6 digits
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const now = Date.now();
    q.insertPhoneOtp.run(phone, codeHash, now + 10 * 60 * 1000, now);

    try {
      const sent = await sendPhoneOtp({ phone, code, config: smsConfig });
      if (!sent.ok) {
        console.error("[turjuman/sms] send failed:", sent.error);
        return res.status(502).json({ error: "send_failed" });
      }
      return res.json({ sent: true, channel: sent.channel || smsConfig.provider });
    } catch (e) {
      console.error("[turjuman/sms] send threw:", e);
      return res.status(502).json({ error: "send_failed" });
    }
  });

  router.post("/auth/phone/verify", (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code ?? "").trim();
    if (!phone || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "invalid_input" });
    }
    const otp = q.findPhoneOtp.get(phone);
    if (!otp) return res.status(400).json({ error: "no_pending_otp" });
    if (otp.consumed_at) return res.status(400).json({ error: "already_used" });
    if (otp.expires_at < Date.now()) return res.status(400).json({ error: "expired" });
    if (otp.attempts >= 5) return res.status(429).json({ error: "too_many_attempts" });
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    if (codeHash !== otp.code_hash) {
      q.bumpPhoneOtpAttempts.run(phone);
      return res.status(401).json({ error: "wrong_code" });
    }
    q.consumePhoneOtp.run(Date.now(), phone);
    const user = findOrCreateUserByPhone(q, phone);
    const sessionId = createSession(q, user.id);
    res.set("Set-Cookie", buildSessionCookie(sessionId, isProduction));
    return res.json({ ok: true });
  });

  return router;
}
