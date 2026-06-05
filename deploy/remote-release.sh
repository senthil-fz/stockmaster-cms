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

# Invoke prisma via `node` (not the .bin shim): GitHub's upload/download-artifact
# does not preserve Unix exec bits, so node_modules/.bin/prisma arrives without
# +x. `node <file>` runs it regardless and ignores the shebang.
PRISMA="node node_modules/prisma/build/index.js"

echo "==> prisma generate (server-native engine)"
$PRISMA generate --schema=prisma/schema.prisma

echo "==> prisma migrate deploy"
$PRISMA migrate deploy --schema=prisma/schema.prisma

# Clean restart (delete + start), NOT reload. `pm2 reload` respawns the process with the
# environment PM2 captured at the ORIGINAL `pm2 start`, and Node's --env-file (set in the
# ecosystem interpreter_args) cannot override an env var that is already present in that
# inherited environment. The combined effect: a rotated secret in api.env (e.g.
# MOBILE_APP_SECRET) silently never reaches the running process — every deploy rewrites
# api.env to no effect. `pm2 delete` + `pm2 start` makes PM2 re-capture the api.env values
# we sourced above, so the process actually picks up the current secrets. Only this app is
# touched (the box's other PM2 apps are untouched) and the health check below gates the swap.
echo "==> pm2 restart (clean env reseed)"
pm2 delete stockmaster-api 2>/dev/null || true
pm2 start "$ECOSYSTEM" --update-env
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
