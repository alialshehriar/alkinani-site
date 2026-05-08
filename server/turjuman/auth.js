// Magic-link auth core: token generation, session lifecycle, cookie helpers.
// Pure functions (no side effects beyond crypto). DB persistence lives in db.js.

import crypto from "node:crypto";

const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function randomFromAlphabet(alphabet, length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function generateToken() {
  return randomFromAlphabet(URL_SAFE, 32);
}

export function generateSessionId() {
  return randomFromAlphabet(URL_SAFE, 48); // 48 chars URL-safe ≥ 192 bits entropy
}

export function generateUserId() {
  return randomFromAlphabet(URL_SAFE, 16);
}

/** Constant-time string comparison; resistant to timing attacks. */
export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const MAGIC_TOKEN_TTL_SEC = 15 * 60;          // 15 min
export const SESSION_BASE_TTL_SEC = 7 * 24 * 60 * 60; // 7d sliding
export const SESSION_HARD_CAP_SEC = 30 * 24 * 60 * 60; // 30d max

export const SESSION_COOKIE = "tj_session";

export function buildSessionCookie(value, secure) {
  const attrs = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_BASE_TTL_SEC}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildClearSessionCookie(secure) {
  const attrs = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readSessionCookie(req) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RX.test(email);
}
