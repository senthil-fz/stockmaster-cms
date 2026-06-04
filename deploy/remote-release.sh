#!/usr/bin/env bash
# Runs ON the server (as the deploy user), piped in by the GitHub Actions deploy
# job after the artifacts are rsync'd. Order matters: migrate the DB BEFORE
# reloading the app, then gate on a health check.
set -euo pipefail

API_DIR=/var/www/api.laabam.in
ENV_FILE=/home/deploy/stockmaster/api.env
ECOSYSTEM=/home/deploy/stockmaster/ecosystem.config.cjs

cd "$API_DIR"

# Load env for the Prisma CLI (DATABASE_URL). Values are shell-safe (base64url
# secrets, URL with no spaces); `set -a` exports everything sourced.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

echo "==> prisma generate (server-native engine)"
./node_modules/.bin/prisma generate --schema=prisma/schema.prisma

echo "==> prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

echo "==> pm2 startOrReload"
pm2 startOrReload "$ECOSYSTEM" --env production --update-env
pm2 save

echo "==> health check (http://127.0.0.1:3001/health)"
for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
    echo "health OK after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "HEALTH CHECK FAILED — dumping recent logs"
pm2 logs stockmaster-api --lines 60 --nostream || true
exit 1
