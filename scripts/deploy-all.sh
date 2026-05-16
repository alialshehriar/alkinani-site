#!/bin/bash
# alkinani.live deploy — pushes to BOTH targets in one shot:
#   1. Hostinger VPS (alkinani.live + chat API + radar)
#   2. Cloudflare Pages (alkinani-site.pages.dev — legacy URL Ali published on X)
#
# These were drifting because each platform deploys differently. Single
# command keeps them in lockstep.
#
# Flags:
#   --frontend-only   skip server.mjs + prompts (use after UI-only changes)
#   --skip-pages      skip the Cloudflare Pages step (rare)
#   --skip-vps        skip the VPS rsync (rare)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FRONTEND_ONLY=0
SKIP_PAGES=0
SKIP_VPS=0
for arg in "$@"; do
  case "$arg" in
    --frontend-only) FRONTEND_ONLY=1 ;;
    --skip-pages)    SKIP_PAGES=1 ;;
    --skip-vps)      SKIP_VPS=1 ;;
    -h|--help)
      grep -E "^#" "$0" | head -20
      exit 0
      ;;
  esac
done

DEPLOY="$ROOT/.deploy/bundle"
VPS_HOST=root@72.62.116.92
VPS_PATH=/home/alkinani/htdocs/alkinani.live

# 1. Build the SPA
echo "→ Building dist…"
npm run build

# 2. Stage the bundle
echo "→ Staging bundle in $DEPLOY"
rm -rf "$DEPLOY/public" "$DEPLOY/turjuman"
mkdir -p "$DEPLOY/public" "$DEPLOY/scripts" "$DEPLOY/prompts" "$DEPLOY/turjuman"
cp -R dist/. "$DEPLOY/public/"
if [ "$FRONTEND_ONLY" = "0" ]; then
  cp server/server.mjs server/package.json "$DEPLOY/"
  cp -R server/prompts/. "$DEPLOY/prompts/"
  cp -R server/turjuman/. "$DEPLOY/turjuman/"
  cp scripts/radar-crawl.mjs scripts/radar-translate.mjs scripts/radar-judge.mjs scripts/radar-config.json scripts/turjuman-cleanup.mjs "$DEPLOY/scripts/"
fi

# 3. VPS — rsync everything that changed
if [ "$SKIP_VPS" = "0" ]; then
  echo "→ rsync → VPS ($VPS_HOST)"
  if [ "$FRONTEND_ONLY" = "1" ]; then
    rsync -avz --delete "$DEPLOY/public/" "$VPS_HOST:$VPS_PATH/public/"
  else
    rsync -avz \
      --exclude=node_modules \
      --exclude='leaderboard.db*' \
      --exclude='.env' \
      "$DEPLOY/" "$VPS_HOST:$VPS_PATH/"
  fi

  echo "→ chown + PM2 restart (sourcing .env so new keys land in process env)"
  ssh "$VPS_HOST" "chown -R alkinani:alkinani $VPS_PATH && \
    sudo -u alkinani bash -lc 'source /home/alkinani/.nvm/nvm.sh; nvm use 22 >/dev/null; \
    cd $VPS_PATH && set -a && source .env && set +a && \
    pm2 restart alkinani --update-env 2>&1 | tail -3'"
fi

# 4. Cloudflare Pages — wrangler deploy
if [ "$SKIP_PAGES" = "0" ]; then
  echo "→ wrangler pages deploy → alkinani-site.pages.dev"
  npx wrangler pages deploy dist \
    --project-name=alkinani-site \
    --branch=main \
    --commit-dirty=true \
    2>&1 | tail -3
fi

# 5. Verify both serve the same JS bundle
echo "→ verifying parity…"
sleep 2
LIVE_BUNDLE=$(curl -sS https://alkinani.live | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
PAGES_BUNDLE=$(curl -sS https://alkinani-site.pages.dev | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
echo "  alkinani.live          : $LIVE_BUNDLE"
echo "  alkinani-site.pages.dev: $PAGES_BUNDLE"
if [ "$LIVE_BUNDLE" = "$PAGES_BUNDLE" ] && [ -n "$LIVE_BUNDLE" ]; then
  echo "✓ deploy complete — both URLs in sync ($LIVE_BUNDLE)"
else
  echo "⚠ bundles differ — Cloudflare Pages cache may take ~30s to flush"
fi
