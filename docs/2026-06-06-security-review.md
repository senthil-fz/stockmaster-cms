# StockMaster — Security Review

**Date:** 2026-06-06
**Scope:** API (`apps/api`), web app (`apps/web`), MCP server (`apps/mcp`), reader/mobile content path, deploy/infra (`deploy/`, `.github/workflows`).
**Method:** Four parallel code audits (auth/session, authorization/access-control, reader/data-leakage, API-hardening/infra), with the High/Medium findings re-verified by hand against the source. Every finding cites `file:line`.

## Bottom line

The headline concern — **data leaking to the public reader / mobile path — is clean.** No PII, draft content, or internal IDs escape to unauthenticated clients. The codebase is unusually well-hardened (no SQL injection, strict input validation, fail-closed guards, secrets validated at boot).

The real gaps are in **abuse protection and session lifecycle**, plus a couple of upload/infra hardening items.

**If you fix three things:** (1) throttle `login`/`refresh`, (2) make logout & password-change actually revoke sessions, (3) fix the upload MIME-sniff + add `nosniff`. The first two are genuine account-takeover exposure; the rest is hardening.

Severity: 🔴 High · 🟠 Medium · 🟡 Low · ⚪ Info.

---

## 🔴 High

### H1 — No rate limiting / brute-force protection on `/auth/login` and `/auth/refresh`

- **Where:** `RateLimitGuard` is applied **only** to the reader controller (`apps/api/src/reader/reader.controller.ts:18`). Global guards are just `JwtAuthGuard` + `ScopeGuard` (`apps/api/src/app.module.ts:42-45`) — no throttler anywhere. Login has no per-attempt friction beyond bcrypt (`apps/api/src/auth/auth.service.ts:45`).
- **Impact:** Unlimited password attempts per IP/account, no lockout or backoff → sustained online password guessing / credential stuffing against any known editor email → account takeover. Most exploitable weakness in the system.
- **Fix:** Add `@nestjs/throttler` (Redis-backed, given the dual-PM2 topology) with strict per-IP + per-account limits on `login` and `refresh`; consider progressive lockout after N failures.

### H2 — Logout & password-change don't revoke sessions; refresh tokens are stateless 7-day JWTs

- **Where:** Logout only clears the cookie (`apps/api/src/auth/auth.controller.ts`, `res.clearCookie`, no server state). `refresh()` re-verifies the JWT statelessly and re-issues — no stored token, no rotation, no reuse detection (`apps/api/src/auth/auth.service.ts:56-68`). `updateUser` rotates the password hash but touches no token state (`auth.service.ts:111`). Default refresh TTL is `7d` (`auth.service.ts:147`).
- **Impact:** A captured refresh token keeps minting access tokens for up to 7 days regardless of logout; resetting a compromised account's password does **not** kill an attacker's existing session.
- **Fix:** Add a `tokenVersion` / `sessionEpoch` column on `User`, embed it as a JWT claim, verify it on `refresh` (ideally on access verification too), and bump it on logout, password change, and suspension. Optionally rotate refresh tokens on each use with reuse detection.

---

## 🟠 Medium

### M1 — Image uploads trust client-supplied MIME and are served without `nosniff`

- **Where:** `apps/api/src/uploads/uploads.service.ts:38` validates on `file.mimetype` (client-controlled) and derives the file extension from it (`:41`) — no magic-byte inspection (no `file-type`/`sharp`). Static serving sets no security headers (`apps/api/src/main.ts:35`), and the **API nginx vhost has none either** (`deploy/nginx/api.stockmasternagaraj.com.conf` — only a bare `location /`, no `add_header`). The SPA vhost sets `nosniff`; the API vhost does not.
- **Impact:** An authenticated editor (or any draft-scoped API key — uploads are not `@JwtOnly`) can store a polyglot/mislabeled file; with no `nosniff` a browser may content-sniff and render it as HTML/JS from the API origin → stored XSS. (SVG is already correctly excluded.)
- **Fix:** Verify real bytes server-side (`file-type`/`sharp`) and reject mismatches; add `X-Content-Type-Options: nosniff` (and ideally `Content-Disposition: inline`) on `/uploads/*` via Nest static options or the API nginx conf.

### M2 — API binds `0.0.0.0:3001` with no host firewall

- **Where:** `apps/api/src/main.ts:40` — `app.listen(port)` with no host arg, so Node binds all interfaces. `deploy/setup-server.sh` configures nginx + certbot but no `ufw`/iptables.
- **Impact:** If port 3001 is reachable directly (firewall/security-group slip), clients bypass nginx and become the trusted hop — they can then spoof `X-Forwarded-For` and defeat the per-IP reader rate limit. *Through nginx this is correctly NOT exploitable* — the recent `trust proxy = loopback` fix (`main.ts:18`) is right.
- **Fix:** `app.listen(port, '127.0.0.1')` and/or add `ufw` rules (allow only 80/443/SSH) to the setup script.

### M3 — User enumeration via login timing side-channel

- **Where:** `apps/api/src/auth/auth.service.ts:47` returns immediately for a non-existent email, while a real email then runs `bcrypt.compare` (`:48`).
- **Impact:** Error *messages* are uniform (good — "Invalid email or password"), but the timing delta (~tens of ms at bcrypt cost 10) is a reliable account-enumeration oracle, feeding H1.
- **Fix:** On the missing-user path, run `bcrypt.compare` against a fixed dummy hash so both branches take equal time before returning the same error.

---

## 🟡 Low

### L1 — In-memory, per-instance rate limiter & HMAC nonce store

- **Where:** `apps/api/src/common/guards/rate-limit.guard.ts:23`, `apps/api/src/common/guards/app-hmac.guard.ts:35`.
- **Impact:** Both reset on restart and aren't shared across replicas. Fine on a single PM2 fork; on horizontal scale the per-IP limit dilutes and the anti-replay nonce window is bypassable by hitting a different node within 5 minutes. Documented honestly in-code.
- **Fix:** Back both with Redis before scaling out.

### L2 — Rate limit keys on `req.ip` = Cloudflare edge IP, not the end user

- **Where:** `apps/api/src/common/guards/rate-limit.guard.ts:27`.
- **Impact:** Behind Cloudflare, `req.ip` is the CF edge IP. Many users share an edge → false 429s; an attacker on another edge gets a fresh bucket. (Code comment says "per client IP" but it's per-edge.)
- **Fix:** If CF is authoritative, key on a validated `CF-Connecting-IP` (checked against CF ranges) for rate-limit/analytics; update the comment.

### L3 — Stats & Uploads are JWT-only via *emergent* default-deny, not an explicit marker

- **Where:** `apps/api/src/stats/stats.controller.ts`, `apps/api/src/uploads/uploads.controller.ts:14` carry neither `@ContentRoute()` nor `@JwtOnly()`.
- **Impact:** No leak today — `ScopeGuard` default-deny (`scope.guard.ts:86-91`) 403s API-key principals (verified). But it's fragile to future refactors that broaden `@ContentRoute()` or change the default.
- **Fix:** Add explicit `@JwtOnly()` to stats and uploads handlers so the intent is load-bearing.

### L4 — `MOBILE_APP_SECRET` is a static shared secret embedded in the app binary

- **Where:** `apps/api/src/common/guards/app-hmac.guard.ts:24-28` (acknowledged in-code).
- **Impact:** A reverse-engineer can extract it and replay valid signed requests. Blast radius = scraping already-public reader content only (no user data, no writes). The HMAC verification itself is solid (constant-time compare with length check `:59`, ±5 min skew window `:49`, nonce replay cache `:54`).
- **Fix (future):** Native attestation (Play Integrity / App Attest), as noted in the mobile-reader design doc. Document a secret-rotation runbook.

### L5 — Dev `docker-compose.yml` publishes Postgres with trivial creds

- **Where:** `docker-compose.yml:7-12` — `POSTGRES_USER/PASSWORD/DB = stockmaster`, `ports: "5433:5432"`.
- **Impact:** Dev-only (production uses a real `DATABASE_URL` secret), but a port-exposed dev box is trivially compromised.
- **Fix:** Drop the published port or bind `127.0.0.1:5433`.

### L6 — `jsdiff` low-severity ReDoS (dependabot)

- **Where:** `pnpm audit` — 1 low, `jsdiff >=6.0.0 <8.0.3` (GHSA-73rr-hh4g-fpgx), transitive. No high/critical/moderate advisories present.
- **Fix:** Bump when convenient.

### L7 — `WEB_ORIGIN` is unvalidated and falls back to localhost

- **Where:** `apps/api/src/main.ts:22` — `origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173'` with `credentials: true`; `WEB_ORIGIN` is not in `config/env.validation.ts`.
- **Impact:** A prod deploy that forgets to set it silently allows only localhost (fails closed for prod browsers, but it's an unvalidated security-relevant config). Note: this is **not** wildcard-with-credentials.
- **Fix:** Add `WEB_ORIGIN` to env validation and require it in production.

### L8 — JWT verification does not pin the signing algorithm

- **Where:** `apps/api/src/auth/auth.service.ts:60`; `apps/api/src/common/guards/jwt-auth.guard.ts:51-53`; `app.module.ts:28` (`JwtModule.register` — no `algorithms`).
- **Impact:** Hardening only, not exploitable here (system is symmetric HS256 end-to-end; no asymmetric keys to enable RS256→HS256 confusion; `jsonwebtoken` rejects `alg:none` with a secret).
- **Fix:** Pin `algorithms: ['HS256']` on all `verifyAsync` calls as defense-in-depth.

### L9 — Bcrypt cost factor 10

- **Where:** `apps/api/src/auth/auth.service.ts:37,111`.
- **Impact:** Library default, acceptable but low end for 2026; combined with H1 it modestly lowers offline-crack cost if the hash DB leaks.
- **Fix:** Consider cost 12.

---

## ⚪ Info / design decisions to confirm

### I1 — Flat authorization model: every JWT user is a full admin

- **Where:** `apps/api/src/common/guards/jwt-auth.guard.ts:55` assigns `req.scopes = ['*']` to all JWT principals; `scope.guard.ts:63` short-circuits on `'*'`. There are no roles in the schema.
- **Detail:** Any signed-in user can create / suspend / delete / reset-the-password-of **any other user** (`auth.controller.ts`, `auth.service.ts:90-135`); the only guards are can't-suspend-self, can't-delete-self, and can't-delete-the-last-account. Likewise any user can edit/delete/publish any book/article/page regardless of `createdById`.
- **Why it's flagged:** Intended for a small trusted editorial team, but it means **any one compromised member account = full-workspace compromise**, including deleting teammates. Worth an explicit product decision rather than a silent default. (Asymmetry to note: API keys *are* correctly owner-scoped — see Good Practices.)

### I2 — `article_open` read-tracking silently no-ops

- **Where:** `apps/api/src/common/interceptors/read-tracking.interceptor.ts:39` reads `req.params.id`, but the article detail route param is `idOrSlug` (`reader.controller.ts:57`), so `record` early-returns. Analytics gap only — no data exposure. (Book page reads use a separate explicit path and work.)

---

## ✅ Verified-good (what *not* to worry about)

- **Reader / mobile path leaks nothing.** Field-explicit serializers (`apps/api/src/books/serializers.ts`, `apps/api/src/articles/serializers.ts`) — no raw Prisma spreads on any read path. Reader never joins the `User` table (`author`/`year` are scalar columns), so `email`/`passwordHash`/`name`/`suspendedAt` have no path out. `createdById` appears only on `VersionSummary`, served solely by the JWT-scoped editor version route — there is **no public version route**. Editorial flags (`hasUnpublishedChanges`) are explicitly stripped.
- **Draft/published boundary holds.** Every reader query filters `publishedVersionId != null` (`reader.service.ts:60,69,97,137,152`) and serves frozen published snapshots; snapshots only contain `status === 'published'` pages (`snapshot.ts:71-82`). No `status` query param is exposed to readers. Guessing IDs/slugs cannot surface drafts. Satisfies the "suspension must not hide published content" invariant — suspension blocks *access* (login/refresh/api-key), never reader visibility.
- **No SQL injection.** All `$queryRaw` in `apps/api/src/stats/stats.service.ts` use `Prisma.sql` tagged templates + `Prisma.join` — no string interpolation. No `$queryRawUnsafe`/`$executeRawUnsafe`, no `eval`/`Function`/`child_process` in app code.
- **Mass assignment closed.** Global `ZodValidationPipe` (`app.module.ts:41`); no `.passthrough()` → unknown keys stripped. `status` removed from update schemas so publish state can't flip via PATCH. Services map each field explicitly (no `...dto` into Prisma `data`); `createdById` set server-side from the principal. `apiKeyScopeSchema` is a fixed enum — no `['*']`/`['admin']` key can be minted.
- **Scope enforcement is default-deny and well-tested.** `ScopeGuard` (`scope.guard.ts`) is fail-closed for API keys; `scope.guard.spec.ts` pins the bypass attempts. An API key can never reach `/api-keys`, `/auth/users`, publish, or delete without the matching scope.
- **API keys are owner-scoped (no IDOR).** `api-keys.service.ts` filters every op on `ownerUserId` — user A cannot list/revoke/delete user B's keys. 256-bit token, sha256-hashed at rest, raw returned exactly once.
- **Secrets management is strong.** Boot-time validation (`config/env.validation.ts`): ≥32-char secrets, access ≠ refresh enforced, `change-me` placeholders rejected in production. No hardcoded secrets; `.env` gitignored. CI writes secrets via an unquoted heredoc with `umask 077` (`deploy.yml`); `ssh-keyscan` pins the host key; `api.env` removed after copy. Nothing sensitive baked into the web bundle.
- **Token handling.** Access token kept in memory only, never localStorage (`apps/web/src/lib/api.ts:45-49`); single-flight refresh. Refresh cookie is `httpOnly` + `SameSite=Lax` + `Secure` in prod + path-scoped to `/v1/admin/auth/refresh` (`auth.controller.ts:18-23`). `passwordHash` never serialized (`toUser`, `auth.service.ts:153-162`).
- **CSRF risk low.** All state-changing routes require a Bearer JWT or `ApiKey` header — never the cookie alone. The only cookie-authed route is POST `/refresh`, which just rotates tokens.
- **XFF spoofing through nginx not possible.** `trust proxy = loopback` (`main.ts:18`) + nginx `$proxy_add_x_forwarded_for` means a client-supplied XFF is ignored. (Caveat: holds only while clients can't reach :3001 directly — see M2.)
- **Error responses don't leak internals.** Default NestJS exception filter (no stack traces in HTTP responses); `ZodValidationPipe` returns structured 400s; the API-key path degrades unexpected errors to 401, not 500. Logging records only method/url/authType/scope-name — no tokens/keys/PII.
- **MCP server holds no key.** Each client presents its own draft-only `ApiKey`, forwarded to the API where it's scope-enforced — no privilege escalation. DNS-rebinding protection opt-in via `MCP_ALLOWED_HOSTS` (ensure set in prod).

---

## Suggested remediation order

1. **H1 + H2 together** (both touch the auth module): throttle login/refresh, and add `tokenVersion`-based session revocation. Ship with tests.
2. **M1**: upload byte-sniffing + `nosniff` header.
3. **M2 + M3**: bind API to loopback / add firewall; dummy-hash the missing-user login path.
4. **I1**: product decision on whether a role/admin tier is needed.
5. Low items as cleanup; revisit the in-memory stores (L1) before any horizontal scaling.
