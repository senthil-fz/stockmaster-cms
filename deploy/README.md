# Deployment

CI/CD for **app.laabam.in** (Vite SPA) and **api.laabam.in** (NestJS API) onto
the Vultr box `45.77.169.33`, behind nginx, API under PM2 as the `deploy` user.

Full design: [`docs/plans/2026-06-04-deployment-pipeline-design.md`](../docs/plans/2026-06-04-deployment-pipeline-design.md).

## Pipeline

`.github/workflows/deploy.yml` runs on push to `master` (or manual dispatch):

1. **build** (`ubuntu-24.04`): pnpm install → build `@stockmaster/shared` →
   typecheck → API unit tests → build API → build web (`VITE_API_URL=https://api.laabam.in`)
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
| `/var/www/app.laabam.in/` | web SPA (rsync `--delete`) |
| `/var/www/api.laabam.in/` | API bundle (rsync `--delete`) |
| `/home/deploy/stockmaster/api.env` | API secrets (CI writes; `chmod 600`) |
| `/home/deploy/stockmaster/ecosystem.config.cjs` | PM2 config |
| `/home/deploy/stockmaster/uploads/` | uploaded images (persistent) |

## Rollback

`pnpm deploy` artifacts are retained 5 days in the Actions run. Re-run an older
successful workflow, or `pm2 restart stockmaster-api` after restoring a prior
`/var/www/api.laabam.in`. DB: restore from the nightly `pg_dump` if a migration
needs reverting.
