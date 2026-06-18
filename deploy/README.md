# Deployment

CI/CD for **app.stockmasternagaraj.com** (Vite SPA) and **api.stockmasternagaraj.com** (NestJS API) onto
the Vultr box `45.77.169.33`, behind nginx, API under PM2 as the `deploy` user.

Full design: [`docs/plans/2026-06-04-deployment-pipeline-design.md`](../docs/plans/2026-06-04-deployment-pipeline-design.md).

## Pipeline

`.github/workflows/deploy.yml` runs on push to `master` (or manual dispatch):

1. **build** (`ubuntu-24.04`): pnpm install → build `@stockmaster/shared` →
   typecheck → API unit tests → build API → build web (`VITE_API_URL=https://api.stockmasternagaraj.com`)
   → `pnpm --filter @stockmaster/api deploy --legacy --prod` → upload artifacts.
2. **deploy**: write `api.env` from secrets → rsync web + API → on server:
   `prisma generate` → `prisma migrate deploy` → `pm2 startOrReload` → health check.

## Required GitHub secrets

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | `45.77.169.33` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | private key contents of `~/.ssh/vultr-deployments` |
| `DATABASE_URL` | `postgresql://stockmaster:<pw>@localhost:5432/stockmaster?schema=public` |
| `JWT_ACCESS_SECRET` | 64-char random |
| `JWT_REFRESH_SECRET` | 64-char random |
| `MOBILE_APP_SECRET` | 64-char random |

## One-time server setup

```bash
# copy nginx confs + setup script to the box, then:
sudo bash setup-server.sh      # creates dirs, installs vhosts, runs certbot
```

This is idempotent and touches only the StockMaster vhosts/dirs.

## Server layout

| Path | Purpose |
| --- | --- |
| `/var/www/app.stockmasternagaraj.com/` | web SPA (rsync `--delete`) |
| `/var/www/api.stockmasternagaraj.com/` | API bundle (rsync `--delete`) |
| `/home/deploy/stockmaster/api.env` | API secrets (CI writes; `chmod 600`) |
| `/home/deploy/stockmaster/ecosystem.config.cjs` | PM2 config |
| `/home/deploy/stockmaster/uploads/` | uploaded images (persistent) |

## Rollback

`pnpm deploy` artifacts are retained 5 days in the Actions run. Re-run an older
successful workflow, or `pm2 restart stockmaster-api` after restoring a prior
`/var/www/api.stockmasternagaraj.com`. DB: restore from the nightly `pg_dump` if a migration
needs reverting.

---

# Marketing website — www.stockmasternagaraj.com

Separate pipeline (`.github/workflows/deploy-website.yml`) for the **Astro static
site** in `apps/website`. It builds in CI and rsyncs the static output to the box,
where nginx serves it directly (no PM2). Deploys as the **`senthilganesh`** user
with a dedicated CI key, independent of the api/web `deploy` pipeline above.

## Pipeline

Runs on push to `master` touching `apps/website/**` (or manual dispatch):

1. **build** (`ubuntu-24.04`): `pnpm install --frozen-lockfile` →
   `pnpm --filter @stockmaster/website build` → upload `apps/website/dist`.
2. **deploy**: `rsync -az --delete` the build into
   `/var/www/www.stockmasternagaraj.com/`, then an HTTPS smoke check.

## Required GitHub secrets

| Secret | Value |
| --- | --- |
| `WEBSITE_DEPLOY_HOST` | `45.77.169.33` |
| `WEBSITE_DEPLOY_USER` | `senthilganesh` |
| `WEBSITE_DEPLOY_SSH_KEY` | private key of the `stockmaster-website-ci` deploy key |

The CI public key is already in `senthilganesh`'s `~/.ssh/authorized_keys`.

## One-time server setup (needs sudo — run manually)

`senthilganesh` has no passwordless sudo, so CI cannot create the vhost/dir or run
certbot. Do this once from the repo checkout (DNS already points
`www`/apex → `45.77.169.33`):

```bash
# 1) Deploy dir, owned by the CI user, group-readable by nginx (setgid keeps group).
sudo mkdir -p /var/www/www.stockmasternagaraj.com
sudo chown senthilganesh:www-data /var/www/www.stockmasternagaraj.com
sudo chmod 2755 /var/www/www.stockmasternagaraj.com

# 2) nginx vhost (copy this repo's conf up first).
scp -i ~/.ssh/frenzo deploy/nginx/www.stockmasternagaraj.com.conf \
    senthilganesh@45.77.169.33:/tmp/
ssh -i ~/.ssh/frenzo senthilganesh@45.77.169.33 '
  sudo cp /tmp/www.stockmasternagaraj.com.conf /etc/nginx/sites-available/ &&
  sudo ln -sf /etc/nginx/sites-available/www.stockmasternagaraj.com.conf \
              /etc/nginx/sites-enabled/ &&
  sudo nginx -t && sudo systemctl reload nginx'

# 3) TLS for www + apex (certbot rewrites the conf to add 443 + redirects).
ssh -i ~/.ssh/frenzo senthilganesh@45.77.169.33 '
  sudo certbot --nginx -d www.stockmasternagaraj.com -d stockmasternagaraj.com \
    --redirect --agree-tos -m nagaraj.limica@gmail.com -n &&
  sudo systemctl reload nginx'
```

After that, every push to `master` that touches `apps/website/**` deploys
automatically. Server layout: `/var/www/www.stockmasternagaraj.com/` (rsync
`--delete`).
