#!/usr/bin/env bash
# setup-twilio-verify.sh — turn Phone OTP from "console" → live Twilio Verify
# in one call.  Run on the VPS as user `alkinani`.
#
# Usage (after you have the 3 Twilio values):
#   bash scripts/setup-twilio-verify.sh \
#     "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \   # account SID
#     "<auth_token>" \                          # auth token
#     "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"      # Verify Service SID
#
# What it does (atomically, with .env backup):
#   1. backs up .env → .env.bak.<ts>
#   2. upserts SMS_PROVIDER=twilio_verify
#   3. upserts TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
#   4. pm2 restart alkinani --update-env
#   5. tails the next 8 log lines so you see provider=twilio_verify in stdout

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <TWILIO_ACCOUNT_SID> <TWILIO_AUTH_TOKEN> <TWILIO_VERIFY_SERVICE_SID>" >&2
  exit 2
fi

SID="$1"
TOKEN="$2"
SVC="$3"

# Sanity-check the SID/Service SID prefixes — Twilio uses these and a typo
# would silently land in .env and only blow up on the next OTP request.
[[ "$SID" =~ ^AC[a-f0-9]{32}$ ]] || { echo "✗ TWILIO_ACCOUNT_SID must look like ACxxxxxxxx... (34 chars)"; exit 3; }
[[ "$SVC" =~ ^VA[a-f0-9]{32}$ ]] || { echo "✗ TWILIO_VERIFY_SERVICE_SID must look like VAxxxxxxxx... (34 chars)"; exit 3; }

ROOT="/home/alkinani/htdocs/alkinani.live"
ENV="$ROOT/.env"
BACKUP="$ROOT/.env.bak.$(date +%Y%m%d-%H%M%S)"

cp "$ENV" "$BACKUP"
echo "→ backup → $BACKUP"

upsert() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV"; then
    # in-place replace; quote val so spaces survive
    sed -i.tmp "s|^${key}=.*|${key}=${val}|" "$ENV" && rm -f "$ENV.tmp"
  else
    printf "\n%s=%s\n" "$key" "$val" >> "$ENV"
  fi
}

upsert SMS_PROVIDER "twilio_verify"
upsert TWILIO_ACCOUNT_SID "$SID"
upsert TWILIO_AUTH_TOKEN "$TOKEN"
upsert TWILIO_VERIFY_SERVICE_SID "$SVC"

echo "→ env updated"
grep -E "^(SMS_PROVIDER|TWILIO_)" "$ENV" | sed 's/=.*/=<set>/'

echo "→ pm2 restart alkinani --update-env"
source /home/alkinani/.nvm/nvm.sh
nvm use 22 >/dev/null
cd "$ROOT"
set -a; source .env; set +a
pm2 restart alkinani --update-env >/dev/null
sleep 2

echo "→ recent log lines (look for 'sms=twilio_verify' or 'auth providers'):"
pm2 logs alkinani --lines 8 --nostream 2>&1 | tail -10 || true

echo
echo "✓ done. Quick test:"
echo "  curl -X POST https://alkinani.live/api/turjuman/auth/phone/request \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"phone\":\"+9665XXXXXXXX\"}'"
echo "  → expects { ok: true, channel: 'sms' } and a real SMS to that number."
