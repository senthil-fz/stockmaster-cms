#!/usr/bin/env bash
# One-time server bootstrap for the StockMaster deployment. Run with sudo:
#   sudo bash setup-server.sh
#
# Expects the two nginx confs alongside it (or in /tmp):
#   ./nginx/app.stockmasternagaraj.com.conf  ./nginx/api.stockmasternagaraj.com.conf   (or /tmp/*.conf)
#
# Idempotent. Does NOT touch any other vhost or app on the box.
set -euo pipefail

DEPLOY_USER=deploy
APP_DOMAIN=app.stockmasternagaraj.com
API_DOMAIN=api.stockmasternagaraj.com
CERTBOT_EMAIL=senthil@mavanex.com

# Locate the nginx confs (repo layout first, then /tmp).
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
find_conf() {
  local name="$1"
  for p in "$SRC_DIR/nginx/$name" "$SRC_DIR/$name" "/tmp/$name"; do
    [ -f "$p" ] && { echo "$p"; return 0; }
  done
  echo "ERROR: cannot find $name (looked in $SRC_DIR/nginx, $SRC_DIR, /tmp)" >&2
  return 1
}
APP_CONF="$(find_conf "${APP_DOMAIN}.conf")"
API_CONF="$(find_conf "${API_DOMAIN}.conf")"

echo "==> [1/5] deploy-user data dirs (env + uploads, persistent, outside rsync tree)"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 700 /home/deploy/stockmaster
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 /home/deploy/stockmaster/uploads

echo "==> [2/5] web/api roots (owned by deploy for rsync, group www-data for nginx)"
install -d -o "$DEPLOY_USER" -g www-data -m 755 "/var/www/$APP_DOMAIN"
install -d -o "$DEPLOY_USER" -g www-data -m 755 "/var/www/$API_DOMAIN"

echo "==> [3/5] install nginx vhosts (HTTP-only; certbot adds TLS next)"
cp "$APP_CONF" "/etc/nginx/sites-available/${APP_DOMAIN}.conf"
cp "$API_CONF" "/etc/nginx/sites-available/${API_DOMAIN}.conf"
ln -sf "/etc/nginx/sites-available/${APP_DOMAIN}.conf" "/etc/nginx/sites-enabled/${APP_DOMAIN}.conf"
ln -sf "/etc/nginx/sites-available/${API_DOMAIN}.conf" "/etc/nginx/sites-enabled/${API_DOMAIN}.conf"

echo "==> [4/5] nginx -t && reload"
nginx -t
systemctl reload nginx

echo "==> [5/5] certbot (issues certs + rewrites vhosts to 443 with 80->443 redirect)"
certbot --nginx -d "$APP_DOMAIN" -d "$API_DOMAIN" \
  --redirect --agree-tos -m "$CERTBOT_EMAIL" -n

echo
echo "DONE. nginx serving https for $APP_DOMAIN and $API_DOMAIN."
echo "Next: ensure /home/deploy/stockmaster/api.env exists (CI writes it on first deploy),"
echo "then trigger the GitHub Actions 'Deploy (production)' workflow."
