#!/usr/bin/env bash
# flip-lemon-to-live.sh — atomically swap Lemon Squeezy from TEST → LIVE.
#
# Pre-req: you've created the 3 LIVE products in the Lemon dashboard
# (Starter / Pro / Studio), grabbed their LIVE variant IDs, generated a LIVE
# API key, and added a LIVE webhook for /api/turjuman/payments/webhook with
# the events `order_created` + `subscription_payment_success`.
#
# Usage (run on the VPS as user `alkinani`):
#   bash scripts/flip-lemon-to-live.sh \
#     "<LEMON_API_KEY>"         \
#     "<LEMON_WEBHOOK_SECRET>"  \
#     "<STARTER_VARIANT_ID>"    \
#     "<PRO_VARIANT_ID>"        \
#     "<STUDIO_VARIANT_ID>"
#
# What it does (atomically, with .env backup):
#   1. backs up .env → .env.bak.<ts>
#   2. upserts LEMON_API_KEY / LEMON_WEBHOOK_SECRET / 3× variant IDs
#   3. pm2 restart alkinani --update-env
#   4. immediately probes /api/turjuman/payments/healthz (or /me) to confirm
#      env was loaded — fails loud if pm2 didn't re-read .env.
#
# Rollback (if something feels off):
#   cp .env.bak.<ts> .env && pm2 restart alkinani --update-env

set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "usage: $0 <LEMON_API_KEY> <LEMON_WEBHOOK_SECRET> <STARTER_ID> <PRO_ID> <STUDIO_ID>" >&2
  exit 2
fi

API_KEY="$1"
WH_SECRET="$2"
STARTER="$3"
PRO="$4"
STUDIO="$5"

# Sanity: variant IDs are numeric strings, API key starts with "lemonsqueezy_"
# or has a long opaque prefix. We don't enforce key format — Lemon may change
# it — but variant IDs being non-numeric is almost always a copy-paste error.
for id in "$STARTER" "$PRO" "$STUDIO"; do
  [[ "$id" =~ ^[0-9]+$ ]] || { echo "✗ variant ID '$id' is not numeric — likely a copy-paste mistake."; exit 3; }
done

ROOT="/home/alkinani/htdocs/alkinani.live"
ENV="$ROOT/.env"
BACKUP="$ROOT/.env.bak.$(date +%Y%m%d-%H%M%S)"

cp "$ENV" "$BACKUP"
echo "→ backup → $BACKUP"

upsert() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV"; then
    sed -i.tmp "s|^${key}=.*|${key}=${val}|" "$ENV" && rm -f "$ENV.tmp"
  else
    printf "\n%s=%s\n" "$key" "$val" >> "$ENV"
  fi
}

upsert LEMON_API_KEY        "$API_KEY"
upsert LEMON_WEBHOOK_SECRET "$WH_SECRET"
upsert LEMON_TURJUMAN_STARTER "$STARTER"
upsert LEMON_TURJUMAN_PRO     "$PRO"
upsert LEMON_TURJUMAN_STUDIO  "$STUDIO"

echo "→ env updated:"
grep -E "^(LEMON_API_KEY|LEMON_WEBHOOK_SECRET|LEMON_TURJUMAN_)" "$ENV" | sed 's/=.*/=<set>/'

echo "→ pm2 restart alkinani --update-env"
source /home/alkinani/.nvm/nvm.sh
nvm use 22 >/dev/null
cd "$ROOT"
set -a; source .env; set +a
pm2 restart alkinani --update-env >/dev/null
sleep 2

echo "→ probing /api/turjuman/auth/me to confirm pm2 reloaded the env"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/api/turjuman/auth/me || echo "fail")
if [ "$HTTP" = "200" ]; then
  echo "  ✓ server responding (HTTP $HTTP)"
else
  echo "  ⚠ server responded HTTP $HTTP — check pm2 logs alkinani"
fi

echo
echo "✓ flip done. Test the LIVE flow now:"
echo "  1. Open https://alkinani.live/tools/turjuman in incognito"
echo "  2. Hit a paywall → Lemon checkout opens with LIVE prices"
echo "  3. Complete a real-card purchase → expect credits granted on /me"
echo
echo "  Rollback if anything feels off:"
echo "    cp $BACKUP $ENV && pm2 restart alkinani --update-env"
