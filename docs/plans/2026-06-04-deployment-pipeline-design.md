# Deployment Pipeline — app.laabam.in & api.laabam.in

**Date:** 2026-06-04
**Status:** Design (validated)

## Goal

CI/CD that builds the web (`apps/web`, Vite SPA) and API (`apps/api`, NestJS +
Prisma) and deploys them to the existing Vultr box (`45.77.169.33`) behind nginx:

- `app.laabam.in` → static SPA
- `api.laabam.in` → NestJS API (reverse-proxied)

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Deploy target | Same box `45.77.169.33` (already runs Postgres 18, nginx, PM2 apps) |
| Package manager | **pnpm** everywhere (Bun bundling of NestJS proven to fail; pnpm `deploy` proven to boot) |
| API runtime | **Node 20** via **PM2**, as the `deploy` user |
| Build location | **GitHub Actions** (`ubuntu-24.04`, matches server glibc), ship artifacts |
| CI → server auth | SSH key `~/.ssh/vultr-deployments` (already authorized for `deploy`) → GitHub secret |
| Secrets/config | Stored as **GitHub secrets**, written to a server env file at deploy; PM2 loads via `node --env-file` |
| TLS | certbot (already installed), per-subdomain certs |
| DNS | `app`/`api`.laabam.in already resolve to the box ✓ |

## Architecture

```
GitHub push (master)
  └─ Actions: build job (ubuntu-24.04)
       pnpm install --frozen-lockfile
       quality gates: typecheck + test
       build @stockmaster/shared, apps/api (nest), apps/web (vite, VITE_API_URL=https://api.laabam.in)
       pnpm --filter @stockmaster/api deploy --legacy --prod ./out/api   # self-contained Node bundle
       upload artifacts: apps/web/dist + ./out/api
  └─ Actions: deploy job (SSH as deploy@45.77.169.33 via vultr-deployments)
       write /home/deploy/stockmaster/api.env  (from GitHub secrets)
       rsync web/dist  → /var/www/app.laabam.in/        (--delete)
       rsync out/api   → /var/www/api.laabam.in/        (--delete, excludes .env & uploads)
       on server: prisma generate (server-native engine) → prisma migrate deploy → pm2 reload → pm2 save
```

## Server layout

| Path | Purpose | Owner |
| --- | --- | --- |
| `/var/www/app.laabam.in/` | Web SPA static files (rsync target, `--delete`) | deploy |
| `/var/www/api.laabam.in/` | API Node bundle (rsync target, `--delete`) | deploy |
| `/home/deploy/stockmaster/api.env` | API env/secrets (outside rsync tree) | deploy, `chmod 600` |
| `/home/deploy/stockmaster/uploads/` | Uploaded images — **persistent, outside rsync tree** | deploy |
| `/etc/nginx/sites-available/{app,api}.laabam.in.conf` | vhosts | root |

## Runtime

- API entry is **`dist/src/main.js`** (nest compiles with prisma scripts → `dist/src/…`;
  the repo's `start` script `node dist/main.js` is wrong for the built layout and is
  unused in prod).
- PM2 app `stockmaster-api`, `fork` mode, `cwd=/var/www/api.laabam.in`,
  `node --env-file=/home/deploy/stockmaster/api.env dist/src/main.js`, port **3001** (free).
- `prisma` moved from devDependencies → dependencies so the `--prod` bundle ships the
  CLI (needed for `generate` + `migrate deploy` on the server, self-contained, no network).
- `UPLOADS_DIR=/home/deploy/stockmaster/uploads` so images survive `rsync --delete`.

## nginx

**app.laabam.in** — static SPA (NOT a reverse proxy):
```
root /var/www/app.laabam.in;
location / { try_files $uri $uri/ /index.html; }
# long-cache hashed assets, gzip, security headers
```

**api.laabam.in** — reverse proxy to Node:
```
location / { proxy_pass http://127.0.0.1:3001; ...proxy headers... }
client_max_body_size 25m;   # CMS image uploads (nginx default 1m → 413)
```

Both: certbot adds the `listen 443 ssl` block + 80→443 redirect.

## Production env contract (GitHub secrets)

```
NODE_ENV=production
DATABASE_URL=postgresql://stockmaster:<STRONG_DB_PW>@localhost:5432/stockmaster?schema=public
JWT_ACCESS_SECRET=<64-char random>     JWT_REFRESH_SECRET=<64-char random>
JWT_ACCESS_TTL=15m                     JWT_REFRESH_TTL=7d
MOBILE_APP_SECRET=<64-char random>
API_PORT=3001
WEB_ORIGIN=https://app.laabam.in       PUBLIC_API_URL=https://api.laabam.in
UPLOADS_DIR=/home/deploy/stockmaster/uploads
# build-time only (baked into web): VITE_API_URL=https://api.laabam.in
# CI/SSH: DEPLOY_SSH_KEY (vultr-deployments private key), DEPLOY_HOST, DEPLOY_USER
```

## One-time server bootstrap (manual, before first deploy)

1. `deploy`: create `/var/www/{app,api}.laabam.in`, `/home/deploy/stockmaster/{uploads}`, write `api.env`.
2. root (sudo): place 2 nginx confs (HTTP-only first), `nginx -t`, reload.
3. root (sudo): `certbot --nginx -d app.laabam.in -d api.laabam.in` (issues certs, rewrites confs to 443).
4. First deploy registers the PM2 app + `pm2 save`.

## Quality gates / no-compromise checks

- CI runs `typecheck` + `test` before building; deploy job only runs if build job passes.
- `prisma migrate deploy` runs **before** `pm2 reload` (never serve against an un-migrated schema).
- API self-validates env on boot (refuses to start on `change-me`/missing secrets).
- Health check after reload: `curl -fsS https://api.laabam.in/health` (or known route) gate.
- Uploads + env live outside the `--delete` rsync tree (no data loss across deploys).

## Out of scope (YAGNI for now)

- `apps/mcp` deployment (only app + API requested).
- Blue/green or multi-replica (single PM2 process + `pm2 reload` zero-downtime is enough).
- WAL/PITR (daily logical backups already configured).
