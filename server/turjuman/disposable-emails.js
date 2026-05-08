// Hardcoded disposable email domain blocklist.
// Anti-Sybil: free-tier abuse via mailinator/tempmail/etc.

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "trashmail.com",
  "throwawaymail.com",
  "yopmail.com",
  "maildrop.cc",
  "getnada.com",
  "sharklasers.com",
  "tempinbox.com",
  "fakeinbox.com",
  "spam4.me",
  "tmpmail.org",
  "tempr.email",
  "discard.email",
  "mintemail.com",
  "mt2015.com",
  "binkmail.com",
]);

export function isDisposable(email) {
  if (typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
