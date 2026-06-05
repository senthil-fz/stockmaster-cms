# API Versioning — design

**Date:** 2026-06-05
**Status:** Implemented

## Goal

Put **every** HTTP endpoint behind an explicit version. Previously only the public mobile
reader API carried a version (`/v1/*`); the editor/CMS API was unversioned (`/books`,
`/auth/*`, `/stats/*`, …), so any breaking change to it hit clients with no version to pin.

## Mechanism

NestJS built-in **URI versioning** (`VersioningType.URI`), enabled in `apps/api/src/main.ts`:

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
```

Chosen over a global path prefix or header versioning because it is the only option that
lets versions be bumped **individually** per controller or per route later (`@Version('2')`
on one handler) while everything else stays on v1 — without custom routing code.

## Route layout

URI versioning prepends `/v<version>` to each route. Two surfaces share `/v1` but are kept
in distinct namespaces so they never collide:

| Surface | Base | Auth | Notes |
|---|---|---|---|
| Public mobile reader | `/v1/books`, `/v1/books/:id`, `/v1/books/:id/pages/:pageno` | HMAC (`AppHmacGuard`) + rate limit | published-only |
| Editor / CMS | `/v1/admin/*` (books, articles, pages, auth, uploads, api-keys, stats) | JWT / ApiKey | the whole CMS surface |
| Liveness probe | `/health` | public | `VERSION_NEUTRAL` — intentionally unversioned for the deploy pipeline |

### Why `/v1/admin` for the editor API

The reader already owns `/v1/books`. Versioning the editor `BooksController` to v1 would
also produce `/v1/books` — a direct collision (same method + path + version). Resolution:
the editor API moves under an `admin` namespace (`/v1/admin/books`, …), leaving the reader's
`/v1/books` untouched. Only the web CMS — deployed alongside the API — had to change its base
URL; the mobile app, which cannot be force-updated, is unaffected.

## Key invariants

- **Reader version is pinned, not inherited.** `ReaderController` uses
  `@Controller({ version: '1' })` rather than relying on `defaultVersion`. `/v1/books` is the
  HMAC-signed external mobile contract (the app signs the literal path); decoupling it means a
  future bump of the global default can never silently move the mobile surface to `/v2`.
- **Refresh-cookie path tracks the route.** The `bp_refresh` httpOnly cookie is scoped to
  `path: '/v1/admin/auth/refresh'` (`auth.controller.ts`). Browsers only return the cookie for
  requests under that path, so it must match the live refresh route exactly.
- **Static image serving is unversioned.** Uploaded-image URLs are returned absolute by the
  API and served by `useStaticAssets` at `${API_URL}/uploads/*` — they do NOT carry the
  `/v1/admin` prefix. Only the upload *endpoint* (`POST /v1/admin/uploads`) moved.

## Client changes

The version is an **explicit part of every endpoint path** (not hidden in the transport):

- **Web** (`apps/web/src/lib/api.ts`): `EDITOR_API = '/v1/admin'` prepended to each `request()`
  path. The generic `request()`/`fetch` helpers keep the bare host.
- **MCP** (`apps/mcp/src/tools.ts`): `EDITOR_API = '/v1/admin'` prepended to each tool's path.
  `api-client.ts` stays a generic host-only transport.
- **Extractor** writes directly to the DB via Prisma — not an HTTP consumer, no change.

## Verification

- `pnpm typecheck` — all 8 workspaces clean.
- API unit tests — 62 passing.
- Live curls against a booted API:
  - `GET /health` → 200 (unversioned)
  - `GET /v1/books` → 401 (HMAC guard ran → route matched → mobile path byte-identical)
  - `GET /v1/admin/{books,stats/books,auth/me}` → 401 (JWT guard ran → routes matched)
  - `GET /books`, `/stats/books`, `/auth/me` → 404 (old unversioned paths gone)
  - `GET /v1/articles`, `POST /v1/books/:id/chapters` → 404 (editor isolated under `/admin`)

## Deploy / coordination notes

- **Breaking route change for the editor API.** Anything fronting the API with path-based
  rules (Cloudflare, reverse proxy, cache) must be updated: editor traffic is now `/v1/admin/*`.
- **Clients that must update:** the web CMS (in this repo, done) and any external MCP client
  pointed at the editor API. The mobile reader app is unaffected.
