// Google OAuth 2.0 (Authorization Code flow with PKCE-equivalent state cookie).
// State is signed with HMAC + timestamp + 10-min TTL — no DB round trip needed.

import crypto from "node:crypto";

const STATE_COOKIE = "tj_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signState(secret, payload) {
  const json = JSON.stringify(payload);
  const data = b64url(json);
  const sig = crypto.createHmac("sha256", secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

function verifyState(secret, token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(data).digest();
  const got = fromB64url(sig);
  if (expected.length !== got.length) return null;
  if (!crypto.timingSafeEqual(expected, got)) return null;
  try {
    const payload = JSON.parse(fromB64url(data).toString("utf8"));
    if (Date.now() - payload.iat > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl({ clientId, redirectUri, statePayload, signingSecret }) {
  const state = signState(signingSecret, { ...statePayload, iat: Date.now() });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

export async function exchangeGoogleCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google_token_exchange_failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const tokens = await res.json();
  // We rely on the id_token (a signed JWT) for the user's identity. We trust
  // Google's signature because the token came directly from their TLS endpoint
  // with a fresh authorization_code we just issued — no man-in-the-middle path
  // here that wouldn't already have broken everything else.
  if (!tokens.id_token) throw new Error("google_no_id_token");
  return tokens;
}

export function decodeGoogleIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("google_bad_id_token");
  const payload = JSON.parse(fromB64url(parts[1]).toString("utf8"));
  if (!payload.sub) throw new Error("google_id_token_missing_sub");
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name || null,
    picture: payload.picture || null,
  };
}

export function buildStateCookie(value, secure) {
  const attrs = [
    `${STATE_COOKIE}=${value}`,
    "Path=/api/turjuman/auth",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(STATE_TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearStateCookie(secure) {
  const attrs = [
    `${STATE_COOKIE}=`,
    "Path=/api/turjuman/auth",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readStateCookie(req) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === STATE_COOKIE) return rest.join("=");
  }
  return null;
}

export { signState, verifyState, STATE_COOKIE };
