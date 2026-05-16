// Sign In with Apple (Web flow). Mirrors oauth-google.js shape.
// State cookie is HMAC-signed (same scheme as Google) with a 10-minute TTL.
//
// Apple's token endpoint requires a JWT `client_secret` signed with our p8
// private key (ES256). The JWT is good for up to 6 months; we re-sign it on
// every callback request — cheap, and avoids stale-secret surprises.
//
// Apple posts the form back via POST (not GET) when scope is requested, so
// the callback route accepts both GET and POST. For now we only request
// minimal scope (name + email) on FIRST login — see start route.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const STATE_COOKIE = "tj_apple_state";
const STATE_TTL_MS = 10 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signState(secret, payload) {
  const data = b64url(JSON.stringify(payload));
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

export function buildAppleAuthUrl({ serviceId, redirectUri, statePayload, signingSecret }) {
  const state = signState(signingSecret, { ...statePayload, iat: Date.now() });
  const params = new URLSearchParams({
    client_id: serviceId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post", // required when scope is requested
    state,
  });
  return {
    url: `https://appleid.apple.com/auth/authorize?${params.toString()}`,
    state,
  };
}

let cachedClientSecret = null;
let cachedClientSecretExpiresAt = 0;

/**
 * Build (and cache) Apple's expected JWT client_secret. Re-signs every 30 days.
 * Apple's max validity is 6 months (15777000s); we use shorter for hygiene.
 */
function buildClientSecret({ teamId, keyId, serviceId, privateKeyPem }) {
  const now = Math.floor(Date.now() / 1000);
  // Cache for 25 days; refresh proactively before 30-day expiry.
  if (cachedClientSecret && cachedClientSecretExpiresAt > now + 60) {
    return cachedClientSecret;
  }
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 30 * 24 * 60 * 60,
    aud: "https://appleid.apple.com",
    sub: serviceId,
  };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const signer = crypto.createSign("SHA256");
  signer.update(data);
  signer.end();
  // Apple expects the raw IEEE P-1363 (r||s) format, not DER.
  const derSig = signer.sign({ key: privateKeyPem, format: "pem" });
  const rawSig = derToJoseSig(derSig, 32);
  const jwt = `${data}.${b64url(rawSig)}`;
  cachedClientSecret = jwt;
  cachedClientSecretExpiresAt = payload.exp;
  return jwt;
}

// Convert a DER-encoded ECDSA signature into IEEE P-1363 raw concatenated
// (r || s) form, padded to keySize bytes each.
function derToJoseSig(derSig, keySize) {
  // DER: 0x30 len 0x02 rLen r 0x02 sLen s
  if (derSig[0] !== 0x30) throw new Error("apple: bad DER sig");
  let i = 2;
  if (derSig[1] & 0x80) i = 2 + (derSig[1] & 0x7f); // long form
  if (derSig[i++] !== 0x02) throw new Error("apple: bad DER r marker");
  const rLen = derSig[i++];
  let r = derSig.slice(i, i + rLen);
  i += rLen;
  if (derSig[i++] !== 0x02) throw new Error("apple: bad DER s marker");
  const sLen = derSig[i++];
  let s = derSig.slice(i, i + sLen);
  // Strip leading zero used to keep r/s positive
  if (r[0] === 0x00) r = r.slice(1);
  if (s[0] === 0x00) s = s.slice(1);
  // Left-pad to keySize
  const out = Buffer.alloc(keySize * 2);
  r.copy(out, keySize - r.length);
  s.copy(out, keySize * 2 - s.length);
  return out;
}

export async function exchangeAppleCode({
  serviceId, teamId, keyId, privateKeyPem, redirectUri, code,
}) {
  const clientSecret = buildClientSecret({ teamId, keyId, serviceId, privateKeyPem });
  const body = new URLSearchParams({
    code,
    client_id: serviceId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`apple_token_exchange_failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const tokens = await res.json();
  if (!tokens.id_token) throw new Error("apple_no_id_token");
  return tokens;
}

export function decodeAppleIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("apple_bad_id_token");
  const payload = JSON.parse(fromB64url(parts[1]).toString("utf8"));
  if (!payload.sub) throw new Error("apple_id_token_missing_sub");
  return {
    sub: payload.sub,
    email: payload.email || null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    isPrivateEmail: payload.is_private_email === true || payload.is_private_email === "true",
  };
}

export function loadApplePrivateKey(path) {
  if (!path) return null;
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    console.warn("[apple] failed to read private key:", e.message);
    return null;
  }
}

// Cookie helpers — same shape as Google's, just a different name so the two
// flows can be in flight simultaneously without overwriting each other.
export function buildAppleStateCookie(value, secure) {
  const attrs = [
    `${STATE_COOKIE}=${value}`,
    "Path=/api/turjuman/auth",
    "HttpOnly",
    // Apple posts back to our callback as a cross-origin form POST when scope
    // is requested. SameSite=None is required (with Secure) for the cookie
    // to survive the round-trip.
    "SameSite=None",
    `Max-Age=${Math.floor(STATE_TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearAppleStateCookie(secure) {
  const attrs = [
    `${STATE_COOKIE}=`,
    "Path=/api/turjuman/auth",
    "HttpOnly",
    "SameSite=None",
    "Max-Age=0",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readAppleStateCookie(req) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === STATE_COOKIE) return rest.join("=");
  }
  return null;
}

export { signState, verifyState, STATE_COOKIE };
