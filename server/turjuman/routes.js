// Express router for /api/turjuman/* endpoints.
// Mounted from server.mjs via app.use("/api/turjuman", turjumanRouter(...))

import express from "express";
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
} from "./db.js";

export function turjumanRouter({
  q,                  // queries object from makeQueries(db)
  resendApiKey,       // string | undefined
  resendFrom,         // e.g. "noreply@alkinani.live"
  baseUrl,            // e.g. "https://alkinani.live"
  isProduction,       // boolean — drives Secure cookie + redirect URL
}) {
  const router = express.Router();

  // POST /api/turjuman/auth/magic-link  { email }
  router.post("/auth/magic-link", async (req, res) => {
    const email = (req.body?.email ?? "").trim().toLowerCase();

    if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });
    if (isDisposable(email)) return res.status(400).json({ error: "disposable_email" });

    // Per-IP rate limit: 20 emails / hour. Tight enough to deter scripts,
    // loose enough that owners testing the flow don't get locked out.
    const ip = req.ip || "unknown";
    const rl = checkAndIncrementRateLimit(q, `magic:ip:${ip}`, 20, 3600);
    if (!rl.allowed) return res.status(429).json({ error: "rate_limited" });

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
      },
    });
  });

  return router;
}
