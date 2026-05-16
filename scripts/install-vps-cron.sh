#!/bin/bash
# Install / refresh AI Radar cron entries on the VPS for the alkinani user.
# Run on the VPS (or via ssh) as the alkinani user, NOT root.
#
# Schedules:
#   */7   — radar-crawl.mjs   (collect from Reddit/HN/GitHub/PH)
#   2-59/7 — radar-translate.mjs (Kimi K2 → title_ar/excerpt_ar/summary_ar)
#
# Critical fix vs. earlier versions: cron defaults to /bin/sh, where
# `. .env` makes sh search $PATH for a file literally named ".env" and
# silently fails. Use `. ./.env` so sh resolves it as a relative path.
#
# Verify after install:
#   journalctl -u cron.service --since '10 minutes ago' | grep alkinani
#   tail -f /home/alkinani/htdocs/alkinani.live/logs/radar.log

set -e
NODE_BIN=/home/alkinani/.nvm/versions/node/v22.22.2/bin/node
APP=/home/alkinani/htdocs/alkinani.live
TMP=/tmp/cron-alk.cur

crontab -l 2>/dev/null | grep -v "radar-crawl\|radar-translate\|radar-judge\|turjuman-cleanup" > "$TMP" || true
cat >> "$TMP" <<EOF
# AI Radar — pipeline runs every 4 min, staggered:
#   crawl    at minute 0,4,8,12...    (collect from sources)
#   judge    at minute 1,5,9,13...    (Kimi novelty/impact scoring of new items)
#   translate at minute 2,6,10,14...  (Arabic translation + summary)
*/4 * * * * cd $APP && set -a && . ./.env && set +a && $NODE_BIN scripts/radar-crawl.mjs >> logs/radar.log 2>&1
1-57/4 * * * * cd $APP && set -a && . ./.env && set +a && $NODE_BIN scripts/radar-judge.mjs >> logs/radar.log 2>&1
2-58/4 * * * * cd $APP && set -a && . ./.env && set +a && $NODE_BIN scripts/radar-translate.mjs >> logs/radar.log 2>&1

# Turjuman — daily cleanup at 03:30 UTC (06:30 Riyadh)
30 3 * * * cd $APP && $NODE_BIN scripts/turjuman-cleanup.mjs >> logs/turjuman-cleanup.log 2>&1
EOF
crontab "$TMP"
rm -f "$TMP"

echo "✓ installed:"
crontab -l | grep -E "radar|turjuman"
