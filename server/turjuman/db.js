// Turjuman SQLite layer. Lives in the same Database connection as the
// existing leaderboard tables. Tables are created with CREATE TABLE IF
// NOT EXISTS so the migration is idempotent.

import { generateUserId, generateSessionId } from "./auth.js";

export function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS turjuman_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      credits_balance INTEGER NOT NULL DEFAULT 0,
      free_credits_remaining INTEGER NOT NULL DEFAULT 10,
      free_credits_reset_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tj_users_email ON turjuman_users(email);
  `);

  // Additive-only migrations for OAuth + phone identity. ALTER TABLE ADD
  // COLUMN throws if the column already exists, so we swallow the error per
  // column rather than guarding with a SELECT (cheaper at boot).
  for (const sql of [
    "ALTER TABLE turjuman_users ADD COLUMN google_id TEXT",
    "ALTER TABLE turjuman_users ADD COLUMN apple_id TEXT",
    "ALTER TABLE turjuman_users ADD COLUMN phone TEXT",
    "ALTER TABLE turjuman_users ADD COLUMN phone_verified_at INTEGER",
    "ALTER TABLE turjuman_users ADD COLUMN display_name TEXT",
    "ALTER TABLE turjuman_users ADD COLUMN avatar_url TEXT",
  ]) {
    try { db.exec(sql); } catch { /* column exists */ }
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tj_users_google ON turjuman_users(google_id) WHERE google_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tj_users_apple  ON turjuman_users(apple_id)  WHERE apple_id  IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tj_users_phone  ON turjuman_users(phone)     WHERE phone     IS NOT NULL;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS turjuman_phone_otps (
      phone TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tj_otp_expires ON turjuman_phone_otps(expires_at);
  `);

  db.exec(`

    CREATE TABLE IF NOT EXISTS turjuman_magic_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tj_magic_email ON turjuman_magic_tokens(email);
    CREATE INDEX IF NOT EXISTS idx_tj_magic_expires ON turjuman_magic_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS turjuman_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES turjuman_users(id),
      created_at INTEGER NOT NULL,
      hard_cap_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tj_sessions_user ON turjuman_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_tj_sessions_expires ON turjuman_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS turjuman_rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL,
      window_seconds INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS turjuman_credits_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES turjuman_users(id),
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      expires_at INTEGER,
      lemon_order_id TEXT UNIQUE,
      refunded_at INTEGER,
      refund_amount_sar REAL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tj_credits_user ON turjuman_credits_log(user_id);

    CREATE TABLE IF NOT EXISTS turjuman_anonymous_quotas (
      anon_id TEXT PRIMARY KEY,
      ip TEXT,
      minutes_used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
}

export const ANON_FREE_MINUTES = 5;
export const REGISTERED_MONTHLY_FREE_MINUTES = 10;

export function makeQueries(db) {
  return {
    findUserByEmail: db.prepare(
      "SELECT * FROM turjuman_users WHERE email = ?"
    ),
    findUserById: db.prepare("SELECT * FROM turjuman_users WHERE id = ?"),
    findUserByGoogleId: db.prepare(
      "SELECT * FROM turjuman_users WHERE google_id = ?"
    ),
    findUserByAppleId: db.prepare(
      "SELECT * FROM turjuman_users WHERE apple_id = ?"
    ),
    findUserByPhone: db.prepare(
      "SELECT * FROM turjuman_users WHERE phone = ?"
    ),
    setUserGoogleId: db.prepare(
      "UPDATE turjuman_users SET google_id = ?, display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?"
    ),
    setUserAppleId: db.prepare(
      "UPDATE turjuman_users SET apple_id = ?, display_name = COALESCE(?, display_name) WHERE id = ?"
    ),
    setUserPhone: db.prepare(
      "UPDATE turjuman_users SET phone = ?, phone_verified_at = ? WHERE id = ?"
    ),
    insertUser: db.prepare(
      `INSERT INTO turjuman_users
       (id, email, credits_balance, free_credits_remaining,
        free_credits_reset_at, created_at, last_active_at)
       VALUES (?, ?, 0, 10, ?, ?, ?)`
    ),
    insertPhoneOtp: db.prepare(
      `INSERT OR REPLACE INTO turjuman_phone_otps
       (phone, code_hash, attempts, expires_at, created_at, consumed_at)
       VALUES (?, ?, 0, ?, ?, NULL)`
    ),
    findPhoneOtp: db.prepare(
      "SELECT * FROM turjuman_phone_otps WHERE phone = ?"
    ),
    bumpPhoneOtpAttempts: db.prepare(
      "UPDATE turjuman_phone_otps SET attempts = attempts + 1 WHERE phone = ?"
    ),
    consumePhoneOtp: db.prepare(
      "UPDATE turjuman_phone_otps SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL"
    ),
    prunePhoneOtps: db.prepare(
      "DELETE FROM turjuman_phone_otps WHERE expires_at < ?"
    ),
    touchUser: db.prepare(
      "UPDATE turjuman_users SET last_active_at = ? WHERE id = ?"
    ),
    insertMagicToken: db.prepare(
      `INSERT INTO turjuman_magic_tokens (token, email, expires_at)
       VALUES (?, ?, ?)`
    ),
    findMagicToken: db.prepare(
      "SELECT * FROM turjuman_magic_tokens WHERE token = ?"
    ),
    consumeMagicToken: db.prepare(
      "UPDATE turjuman_magic_tokens SET consumed_at = ? WHERE token = ? AND consumed_at IS NULL"
    ),
    pruneMagicTokens: db.prepare(
      "DELETE FROM turjuman_magic_tokens WHERE expires_at < ?"
    ),
    insertSession: db.prepare(
      `INSERT INTO turjuman_sessions
       (id, user_id, created_at, hard_cap_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ),
    findSession: db.prepare(
      "SELECT * FROM turjuman_sessions WHERE id = ?"
    ),
    extendSession: db.prepare(
      "UPDATE turjuman_sessions SET expires_at = ?, last_used_at = ? WHERE id = ?"
    ),
    deleteSession: db.prepare(
      "DELETE FROM turjuman_sessions WHERE id = ?"
    ),
    pruneSessions: db.prepare(
      "DELETE FROM turjuman_sessions WHERE expires_at < ? OR hard_cap_at < ?"
    ),
    rateLimitGet: db.prepare(
      "SELECT * FROM turjuman_rate_limits WHERE key = ?"
    ),
    rateLimitUpsert: db.prepare(
      `INSERT INTO turjuman_rate_limits (key, count, window_start, window_seconds)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1`
    ),
    rateLimitReset: db.prepare(
      `UPDATE turjuman_rate_limits SET count = 1, window_start = ? WHERE key = ?`
    ),
    findAnonQuota: db.prepare(
      "SELECT * FROM turjuman_anonymous_quotas WHERE anon_id = ?"
    ),
    insertAnonQuota: db.prepare(
      "INSERT INTO turjuman_anonymous_quotas (anon_id, ip, minutes_used, created_at) VALUES (?, ?, 0, ?)"
    ),
    incrementAnonQuota: db.prepare(
      "UPDATE turjuman_anonymous_quotas SET minutes_used = minutes_used + ? WHERE anon_id = ?"
    ),

    // ── Paid credit ledger (Lemon Squeezy webhook target) ─────────────
    // Idempotent insert: if we've already booked this lemon_order_id, the
    // UNIQUE index on lemon_order_id makes this a no-op.
    insertCreditsLog: db.prepare(
      `INSERT OR IGNORE INTO turjuman_credits_log
         (user_id, delta, reason, expires_at, lemon_order_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ),
    findCreditsByLemonOrder: db.prepare(
      "SELECT * FROM turjuman_credits_log WHERE lemon_order_id = ?"
    ),
    addUserCredits: db.prepare(
      "UPDATE turjuman_users SET credits_balance = credits_balance + ? WHERE id = ?"
    ),
    markCreditsRefunded: db.prepare(
      `UPDATE turjuman_credits_log
         SET refunded_at = ?, refund_amount_sar = ?
       WHERE lemon_order_id = ? AND refunded_at IS NULL`
    ),
    sumActiveCredits: db.prepare(
      `SELECT COALESCE(SUM(delta), 0) AS total
         FROM turjuman_credits_log
        WHERE user_id = ?
          AND refunded_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?)`
    ),
  };
}

/**
 * Atomically grant credits to a user from a Lemon order. Returns true if
 * this insert was the first time we saw this lemon_order_id (i.e. the
 * caller should consider the order applied), false if a duplicate webhook
 * was being replayed.
 *
 * Wraps both rows in a transaction so a crash between them can't leave
 * the user under-credited.
 */
export function grantCreditsFromLemonOrder(db, q, {
  userId, minutes, lemonOrderId, expiresAt, reason,
}) {
  const tx = db.transaction(() => {
    const info = q.insertCreditsLog.run(
      userId,
      minutes,
      reason || "lemon_order_paid",
      expiresAt ?? null,
      lemonOrderId,
      Date.now()
    );
    if (info.changes !== 1) {
      // Already booked — replay; do NOT bump balance again.
      return false;
    }
    q.addUserCredits.run(minutes, userId);
    return true;
  });
  return tx();
}

/**
 * Reverse a previously-granted Lemon order. Idempotent: if we never saw the
 * order, or it's already marked refunded, returns false.
 */
export function reverseCreditsFromLemonOrder(db, q, {
  lemonOrderId, refundAmountSar,
}) {
  const tx = db.transaction(() => {
    const row = q.findCreditsByLemonOrder.get(lemonOrderId);
    if (!row) return false;
    if (row.refunded_at) return false;
    const updated = q.markCreditsRefunded.run(
      Date.now(), refundAmountSar ?? null, lemonOrderId
    );
    if (updated.changes !== 1) return false;
    // Reverse only what's still on the balance — never let it go negative
    // (user may have already spent the credits).
    q.addUserCredits.run(-row.delta, row.user_id);
    // Clamp to 0 in case the spend left them below 0 after reversal.
    db.prepare(
      "UPDATE turjuman_users SET credits_balance = MAX(0, credits_balance) WHERE id = ?"
    ).run(row.user_id);
    return true;
  });
  return tx();
}

export function getOrCreateAnonQuota(q, anonId, ip) {
  let quota = q.findAnonQuota.get(anonId);
  if (!quota) {
    q.insertAnonQuota.run(anonId, ip, Date.now());
    quota = q.findAnonQuota.get(anonId);
  }
  // Anonymous jobs have user_id = "anon:<id>" — make sure a placeholder
  // row exists in turjuman_users so the FK in turjuman_jobs is satisfied.
  const phantomId = `anon:${anonId}`;
  const existing = q.findUserById.get(phantomId);
  if (!existing) {
    const now = Date.now();
    const next = new Date();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCHours(0, 0, 0, 0);
    q.insertUser.run(
      phantomId,
      `${phantomId}@anon.turjuman.local`,
      next.getTime(),
      now,
      now
    );
  }
  return quota;
}

export function incrementAnonUsed(q, anonId, minutes) {
  q.incrementAnonQuota.run(minutes, anonId);
}

// Compute the next "1st of next month UTC midnight" timestamp (ms).
function nextMonthlyResetMs() {
  const next = new Date();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.getTime();
}

export function getUserByEmail(q, email) {
  return q.findUserByEmail.get(email.toLowerCase()) ?? null;
}

export function getUserById(q, id) {
  return q.findUserById.get(id) ?? null;
}

export function createUser(q, email) {
  const id = generateUserId();
  const now = Date.now();
  q.insertUser.run(id, email.toLowerCase(), nextMonthlyResetMs(), now, now);
  return q.findUserById.get(id);
}

export function touchUser(q, id) {
  q.touchUser.run(Date.now(), id);
}

export function storeMagicToken(q, token, email) {
  const expiresAt = Date.now() + 15 * 60 * 1000;
  q.insertMagicToken.run(token, email.toLowerCase(), expiresAt);
}

/**
 * Look up a magic token, mark it consumed atomically, and return its email
 * if the token was valid AND not previously consumed AND not expired.
 * Returns null otherwise.
 */
export function consumeMagicToken(q, token) {
  const row = q.findMagicToken.get(token);
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < Date.now()) return null;

  const result = q.consumeMagicToken.run(Date.now(), token);
  if (result.changes !== 1) return null;
  return row.email;
}

export function createSession(q, userId) {
  const now = Date.now();
  const sessionId = generateSessionId();
  const SESSION_BASE_MS = 7 * 24 * 60 * 60 * 1000;
  const SESSION_HARD_CAP_MS = 30 * 24 * 60 * 60 * 1000;
  q.insertSession.run(
    sessionId,
    userId,
    now,
    now + SESSION_HARD_CAP_MS,
    now + SESSION_BASE_MS,
    now
  );
  return sessionId;
}

/**
 * Read a session, sliding the expiry window forward by 7 days on each use.
 * Returns the session row if valid, or null if expired/missing/past hard cap.
 */
export function readSession(q, sessionId) {
  const row = q.findSession.get(sessionId);
  if (!row) return null;
  const now = Date.now();
  if (row.hard_cap_at < now) {
    q.deleteSession.run(sessionId);
    return null;
  }
  if (row.expires_at < now) {
    q.deleteSession.run(sessionId);
    return null;
  }
  // Slide forward, but never past hard cap.
  const SESSION_BASE_MS = 7 * 24 * 60 * 60 * 1000;
  const newExpiry = Math.min(now + SESSION_BASE_MS, row.hard_cap_at);
  q.extendSession.run(newExpiry, now, sessionId);
  return row;
}

export function deleteSession(q, sessionId) {
  q.deleteSession.run(sessionId);
}

/**
 * Fixed-window rate limit. Returns { allowed, remaining }.
 * Uses SQLite as the backing store so it survives restarts (KV-equivalent).
 */
export function checkAndIncrementRateLimit(q, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = q.rateLimitGet.get(key);

  if (!row) {
    q.rateLimitUpsert.run(key, now, windowSeconds);
    return { allowed: true, remaining: limit - 1 };
  }

  // If window has expired, reset.
  if (now - row.window_start >= row.window_seconds) {
    q.rateLimitReset.run(now, key);
    return { allowed: true, remaining: limit - 1 };
  }

  if (row.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  q.rateLimitUpsert.run(key, now, windowSeconds);
  return { allowed: true, remaining: limit - row.count - 1 };
}

/** Periodic prune (call from a setInterval, every hour). */
export function prune(q) {
  const now = Date.now();
  q.pruneMagicTokens.run(now);
  q.pruneSessions.run(now, now);
  q.prunePhoneOtps.run(now);
}

// ── OAuth + phone helpers ────────────────────────────────────────────────────

/**
 * Find or create a user by Google sub. If a user already exists with the
 * same email but no google_id, we link them. Returns the user row.
 */
export function findOrCreateUserByGoogle(q, { sub, email, name, picture }) {
  if (!sub) throw new Error("google sub required");
  const lcEmail = (email || "").toLowerCase();
  let user = q.findUserByGoogleId.get(sub);
  if (user) {
    q.setUserGoogleId.run(sub, name || null, picture || null, user.id);
    touchUser(q, user.id);
    return q.findUserById.get(user.id);
  }
  if (lcEmail) {
    user = q.findUserByEmail.get(lcEmail);
    if (user) {
      q.setUserGoogleId.run(sub, name || null, picture || null, user.id);
      touchUser(q, user.id);
      return q.findUserById.get(user.id);
    }
  }
  if (!lcEmail) {
    throw new Error("google account missing email");
  }
  const created = createUser(q, lcEmail);
  q.setUserGoogleId.run(sub, name || null, picture || null, created.id);
  return q.findUserById.get(created.id);
}

/**
 * Find or create a user by Apple sub. Apple omits email on subsequent logins,
 * so we always look up by apple_id first; email is only known on first auth.
 */
export function findOrCreateUserByApple(q, { sub, email, name }) {
  if (!sub) throw new Error("apple sub required");
  let user = q.findUserByAppleId.get(sub);
  if (user) {
    touchUser(q, user.id);
    return user;
  }
  const lcEmail = (email || "").toLowerCase();
  if (lcEmail) {
    user = q.findUserByEmail.get(lcEmail);
    if (user) {
      q.setUserAppleId.run(sub, name || null, user.id);
      touchUser(q, user.id);
      return q.findUserById.get(user.id);
    }
  }
  // Apple users without an email get a synthetic placeholder. They can update
  // it later from /account; until then their identity is the apple sub.
  const finalEmail = lcEmail || `apple_${sub.slice(0, 16)}@apple.turjuman.local`;
  if (q.findUserByEmail.get(finalEmail)) {
    // collision (extremely rare) — append timestamp to dodge UNIQUE
    return findOrCreateUserByApple(q, { sub: sub + "_" + Date.now(), email, name });
  }
  const created = createUser(q, finalEmail);
  q.setUserAppleId.run(sub, name || null, created.id);
  return q.findUserById.get(created.id);
}

/**
 * Find or create a user by phone (E.164). On first phone login a synthetic
 * email is assigned; the user can swap to a real one in /account later.
 */
export function findOrCreateUserByPhone(q, phoneE164) {
  if (!phoneE164 || !phoneE164.startsWith("+")) {
    throw new Error("phone must be E.164 with +");
  }
  let user = q.findUserByPhone.get(phoneE164);
  if (user) {
    q.setUserPhone.run(phoneE164, Date.now(), user.id);
    touchUser(q, user.id);
    return q.findUserById.get(user.id);
  }
  // Synthetic email lets us reuse the existing email-keyed table layout.
  const syntheticEmail = `phone_${phoneE164.replace(/[^0-9]/g, "")}@phone.turjuman.local`;
  user = q.findUserByEmail.get(syntheticEmail);
  if (!user) {
    user = createUser(q, syntheticEmail);
  }
  q.setUserPhone.run(phoneE164, Date.now(), user.id);
  return q.findUserById.get(user.id);
}
