# Draft-only MCP server — implementation plan

**Date:** 2026-06-02  
**Source design:** [2026-06-02-draft-only-mcp-server-design.md](./2026-06-02-draft-only-mcp-server-design.md)  
**Status:** Verified plan, ready to implement

Produced by a 3-phase multi-agent workflow (6 read-only mappers → 4 adversarial lenses → synthesis). 
The adversarial pass surfaced **10 blocker/high issues** in the original design — most importantly that the 
enforcement model was *fail-open*. This plan inverts it to **default-deny** and resolves every issue.

---

## Critical design changes (forced by the adversarial review)

These supersede the corresponding sections of the design doc.

### 1. Invert scope enforcement to default-deny

Invert scope enforcement from opt-in @RequireScope markers (design lines 79-85) to DEFAULT-DENY for non-wildcard (ApiKey) principals. ScopeGuard decision order is fixed: (1) @Public route -> allow; (2) req.scopes includes '*' (JWT) -> allow; (3) non-wildcard principal -> deny UNLESS the route is on a positive content allowlist (the 9 works/pages/chapters routes the MCP tool table maps to), AND within that allowlist still 403 on publish-transition / delete unless the key holds works:publish / works:delete.

> **Why:** HARDEN blocker #1 (Security) + high #3/#7 (NestJS) + high #4 (Security): generalizing the single global JwtAuthGuard makes EVERY non-@Public route ApiKey-reachable. Verified: POST /auth/users (auth.controller.ts:35) has no @Public and is protected only by the global guard, and POST /api-keys would be the same -> a draft-only key could create users and mint a full-scope key. Opt-in @RequireScope is fail-open: any unmarked or future status/delete route silently allows publish/delete. Default-deny makes new sensitive routes safe-by-default; uploads/auth/stats/reader carry no content annotation so ApiKey is automatically denied there.

### 2. Make publish/delete check body/method-driven, pinned to publishStatusSchema

Make the publish/delete check body/method-driven inside ScopeGuard, not marker-driven, and derive the 'published' test from publishStatusSchema via safeParse rather than a raw string compare. wantsPublish = (method is PATCH) AND publishStatusSchema.safeParse(req.body?.status).success AND parsed value === 'published'; wantsDelete = (method === 'DELETE'). Guard against non-object/array/null bodies (treat as no-publish-attempt).

> **Why:** HARDEN high #5 (Security) + medium #1 (NestJS): guards run BEFORE the global ZodValidationPipe (app.module.ts:34), so the guard sees raw un-validated body. Today === 'published' is safe only because publishStatusSchema (work.ts:8) is exact-match z.enum; if anyone later adds .transform/.coerce/.default the guard's string check drifts from the DB value -> silent publish. Binding the guard to the same schema via safeParse keeps guard and persistence as one source of truth and a regression test pins it.

### 3. Record authType and enforce JWT-only on key-mgmt / user-creation routes

Record authType ('jwt' | 'apikey') on the request in the auth guard, and assert authType === 'jwt' on POST /api-keys and POST /auth/users. POST /api-keys must also validate the requested scopes array against a fixed zod enum (e.g. ['works:write','works:publish','works:delete']) and must never let a caller mint a key broader than itself.

> **Why:** HARDEN blocker #1 + NestJS high #3: default-deny already blocks ApiKey from these routes (no content annotation), but an explicit authType assertion makes the JWT-only contract legible and gives the escalation e2e test a concrete thing to assert. Scope-enum validation prevents a future code path from minting a ['*'] or ['works:publish'] key.

### 4. Defer validate_content to v2; drop it from the v1 tool table

Defer validate_content to a v2 iteration and DROP it from the v1 MCP tool table. v1 ships with three working safety nets instead: (a) a CORRECTED documented vocabulary in update_page's tool description, (b) get_page echo for read-modify-write, (c) verbatim NestJS error-message pass-through in the MCP HTTP client. Do NOT hardcode a parallel ProseMirror schema in apps/mcp.

> **Why:** HARDEN blocker #3 + high #8 (MCP-UX): verified all 5 custom nodes import @tiptap/react at module top and CaptionedImage.tsx imports uploadsApi from '../../lib/api' (web-runtime code), so direct reuse of blockExtensions in a Node server is impossible. The MAP's fallback (hardcode a replica in apps/mcp/src/schema.ts) is 'confidently wrong' — a hand-copied schema drifts from the editor and either passes content the editor drops or flags content it accepts. Design lines 215-217 already sanction deferral. A correct extraction (@blockpress/editor-schema, React-free node specs) is the v2 path.

### 5. Correct the page-content vocabulary advertised to the agent

Correct the page-content vocabulary advertised to the agent. Supported block nodes: paragraph, heading{level:1|2|3}, bulletList, orderedList, listItem, quote{attrs:{cite}}, callout{attrs:{tone:'info'|'neutral'|'warn'|'success', icon}}, captionedImage{attrs:{src,caption,align:'full'|'left',label}} (atom; src must be an absolute http(s) URL, no upload tool exists), divider{attrs:{variant:'line'|'dots'}} (atom), table/tableRow/tableHeader/tableCell. Marks on text: bold, italic, code, link{href}. REMOVE blockquote and codeBlock entirely.

> **Why:** HARDEN blocker #1 (MCP-UX): verified useBlockEditor.ts:17-18 configures StarterKit with blockquote:false and codeBlock:false, so the design's documented set (lines 130-132) lists two nonexistent nodes and omits every real custom node (quote, callout, captionedImage, divider, table family). An agent following the design's vocabulary emits nodes ProseMirror silently drops. Attrs/enum values verified directly: Callout.tsx:5, Quote.tsx, Divider.tsx:4, CaptionedImage.tsx:7.

### 6. Make AuthUser.email optional + add Express.Request type augmentation

Make AuthUser.email optional and add an ambient Express.Request augmentation for user/scopes/authType.

> **Why:** HARDEN medium #5 (NestJS) + low #4/#5 (Migration): current-user.decorator.ts:3-6 types email as required string, but the ApiKey path sets req.user = { id: ownerUserId } with no email -> the type lies. req.scopes/req.authType are brand-new fields with no Express type, defeating strict-mode checking (a req.scope vs req.scopes typo would silently fail-open/closed).

---

## Confirmed blocker / high-severity findings

Full detail (file:line evidence) is in the workflow transcript; summarized:

- **[BLOCKER]** Generalizing the global JwtAuthGuard makes EVERY authenticated route ApiKey-reachable; a draft-only key can create users and mint a full-scope key
- **[HIGH]** Scope enforcement is fail-open: forgetting @RequireScope on a status/delete route silently allows publish/delete
- **[HIGH]** ScopeGuard reads raw req.body.status before validation; its 'published' match must be pinned to publishStatusSchema or it will drift
- **[HIGH]** A second global APP_GUARD (ScopeGuard) will run on EVERY route, including @Public() reader routes — must bail out early or it breaks the mobile API
- **[HIGH]** Widening the single global JwtAuthGuard to also resolve ApiKeys changes behavior on the protected, non-@Public routes that MUST stay JWT-only — /api-keys and /auth/users
- **[BLOCKER]** Documented content vocabulary is wrong in both directions — lists nonexistent nodes and omits the real ones
- **[BLOCKER]** No server-side feedback channel: malformed/dropped content returns 200 OK, so without validate_content the agent flies blind
- **[HIGH]** validate_content's 'exact extension set' requirement is not feasibly satisfiable as written; the documented fallback (hardcoded copy) gives false confidence
- **[HIGH]** Wildcard scope ['*'] silently breaks publish/delete for ALL existing JWT/web callers unless ScopeGuard special-cases it
- **[HIGH]** Auth-guard generalization concentrates new failure surface (incl. a DB call) onto the global guard that gates 100% of requests, with zero existing test coverage

---

## Implementation steps (dependency-ordered)

15 steps. `deps` are step numbers that must land first.

### Step 1 — Add ApiKey Prisma model + User back-relation
`prisma`  ·  **deps:** —

**Files:** `apps/api/prisma/schema.prisma`

**Change:** Add the ApiKey model exactly as the design specifies (lines 49-61): id String @id @default(cuid()); name String; hashedKey String @unique; prefix String; scopes String[] @default([]); ownerUserId String; owner User @relation(fields: [ownerUserId], references: [id], onDelete: Cascade); lastUsedAt DateTime?; revokedAt DateTime?; createdAt DateTime @default(now()). Add @@index([ownerUserId]). Add 'apiKeys ApiKey[]' to the User model (after the existing works/readEvents relations at lines 33-34). Follows existing conventions verified in schema.prisma (cuid ids, onDelete: Cascade on Chapter/Page/ReadEvent).

**Verify:** From repo root run `pnpm --filter @blockpress/api exec prisma validate` (schema parses) and `pnpm --filter @blockpress/api exec prisma format` (no diff after). Confirm ApiKey appears and User.apiKeys back-relation resolves.

### Step 2 — Generate the additive migration
`prisma`  ·  **deps:** #1

**Files:** `apps/api/prisma/migrations/<timestamp>_add_api_keys/migration.sql`

**Change:** From apps/api run `pnpm run migrate` (dotenv -e ../../.env -- prisma migrate dev) with name add_api_keys, following the existing timestamp convention (e.g. 20260529192347_init). Review the generated SQL: it must be purely additive — CREATE TABLE "ApiKey", CREATE UNIQUE INDEX on hashedKey, CREATE INDEX on ownerUserId, ADD FOREIGN KEY to User(id) ON DELETE CASCADE. There must be NO ALTER TABLE "User" column add/backfill (apiKeys is a virtual relation; the FK lives on ApiKey).

**Verify:** Inspect migration.sql: only CREATE TABLE/INDEX + FK, no destructive statements. `pnpm --filter @blockpress/api exec prisma migrate status` shows the new migration applied and DB in sync. `pnpm --filter @blockpress/api exec prisma generate` regenerates the client so prisma.apiKey delegate exists.

### Step 3 — Add Express request type augmentation + make AuthUser.email optional
`api-auth`  ·  **deps:** —

**Files:** `apps/api/src/common/types/express.d.ts`, `apps/api/src/common/decorators/current-user.decorator.ts`, `apps/api/tsconfig.json`

**Change:** Create express.d.ts with `declare global { namespace Express { interface Request { user?: { id: string; email?: string }; scopes?: string[]; authType?: 'jwt' | 'apikey'; } } } export {};`. Change AuthUser interface (current-user.decorator.ts:3-6) to `{ id: string; email?: string }`. Ensure the .d.ts is picked up (it lives under src which is already in tsconfig include; verify `include`/`typeRoots` cover it).

**Verify:** `pnpm --filter @blockpress/api run typecheck` passes. In a scratch check, assigning req.scopes/req.authType in a guard compiles without `as any`. Audit existing @CurrentUser consumers (auth.controller.ts:67 me(), works.controller.ts:23 create()) read only user.id — confirmed safe with email optional.

### Step 4 — Add api-key crypto helpers (generation, hashing, verification)
`api-keys`  ·  **deps:** —

**Files:** `apps/api/src/api-keys/api-key.crypto.ts`

**Change:** Export: generateRawKey() -> 'bp_' + crypto.randomBytes(32).toString('hex') (256-bit, non-secret namespace prefix); hashKey(raw) -> crypto.createHash('sha256').update(raw).digest('hex'); derivePrefix(raw) -> raw.slice(0, 8). Import createHash/randomBytes from 'node:crypto' (same module the codebase already uses in app-hmac.guard.ts:7 and uploads.service randomUUID). Use sha256 (NOT bcryptjs) — bcrypt is for passwords; a 256-bit random token needs no salt/work-factor.

**Verify:** Unit test (Jest, set up in step 13): hashKey is deterministic (same input -> 64-char hex), generateRawKey returns >=64 chars with 'bp_' prefix, derivePrefix returns 8 chars. `node -e "const c=require('node:crypto'); console.log(c.createHash('sha256').update('x').digest('hex').length)"` prints 64.

### Step 5 — Generalize the global auth guard to accept Bearer JWT and ApiKey, fail-closed
`api-auth`  ·  **deps:** #2, #3, #4

**Files:** `apps/api/src/common/guards/jwt-auth.guard.ts`

**Change:** Inject PrismaService into the constructor. Keep the @Public early-return (line 27) unchanged. Structure canActivate so the Bearer path is fully self-contained and RETURNS before any ApiKey/DB code is reachable: `if (header?.startsWith('Bearer ')) { verifyAsync; req.user = {id,email}; req.scopes = ['*']; req.authType = 'jwt'; return true; }`. Then `else if (header?.startsWith('ApiKey ')) { const raw = header.slice('ApiKey '.length); const hashed = hashKey(raw); const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } }); if (!key || key.revokedAt !== null) throw new UnauthorizedException('Invalid API key'); req.user = { id: key.ownerUserId }; req.scopes = key.scopes; req.authType = 'apikey'; prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {}); return true; }`. Else `throw new UnauthorizedException('Missing or invalid authorization')`. Wrap the whole ApiKey branch so any unexpected Prisma error becomes UnauthorizedException (401), never a propagated 500.

**Verify:** Tests (step 13): Bearer-valid -> req.scopes ['*'], authType 'jwt'; Bearer-invalid -> 401; ApiKey-valid -> req.user.id = ownerUserId, scopes = key.scopes, authType 'apikey'; ApiKey-revoked (revokedAt set) -> 401; ApiKey-unknown -> 401; malformed/absent header -> 401; lastUsedAt rejection does not fail the request. Manual: existing web login (Bearer) still works against a running API.

### Step 6 — Create @ContentRoute marker decorator + @JwtOnly marker
`api-auth`  ·  **deps:** —

**Files:** `apps/api/src/common/decorators/scopes.decorator.ts`

**Change:** Export a @ContentRoute() decorator (SetMetadata key IS_CONTENT_ROUTE) used to positively allowlist the works/pages content routes an ApiKey MAY reach (subject to publish/delete scope checks inside ScopeGuard). Export @JwtOnly() (SetMetadata key IS_JWT_ONLY) for key-management/user-creation routes that ApiKey principals must never reach. Export the scope string constants ('works:write'|'works:publish'|'works:delete'). JSDoc each decorator with its semantics.

**Verify:** `pnpm --filter @blockpress/api run typecheck` passes. Decorators export the metadata keys ScopeGuard (step 7) imports. No runtime behavior yet.

### Step 7 — Create ScopeGuard implementing default-deny for non-wildcard principals
`api-auth`  ·  **deps:** #3, #6

**Files:** `apps/api/src/common/guards/scope.guard.ts`

**Change:** Inject `PrismaService` (needed for the published-row check in clause 6). Implement CanActivate with this FIXED decision order: (1) `if (reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler,class])) return true;` (mirrors JwtAuthGuard so it never reads undefined scopes on @Public reader routes). (2) `const scopes = req.scopes ?? []; if (scopes.includes('*')) return true;` (JWT bypass — THIS is the backward-compat contract; must precede all per-scope logic). (3) `if (reflector.getAllAndOverride(IS_JWT_ONLY, ...)) throw new ForbiddenException('this endpoint requires a user session');` (also assert req.authType === 'jwt'). (4) `if (!reflector.getAllAndOverride(IS_CONTENT_ROUTE, ...)) throw new ForbiddenException('API key not permitted on this route');` (DEFAULT-DENY: any non-allowlisted route is forbidden for ApiKey principals). (5) On content routes: compute wantsPublish via `publishStatusSchema.safeParse(req.body?.status)` (parsed === 'published'), guarding non-object bodies; if wantsPublish && !scopes.includes('works:publish') -> `throw new ForbiddenException('draft-only key cannot publish')`. If `req.method === 'DELETE'` && !scopes.includes('works:delete') -> `throw new ForbiddenException('draft-only key cannot delete')`. **(6) Published-row guard (REFINEMENT 2026-06-02 — no versioning exists, so a draft-only key must not mutate already-live content): if `req.method === 'PATCH'` on `works/:id` or `pages/:id` and !scopes.includes('works:publish'), fetch the target's current status — `prisma.work.findUnique({where:{id}, select:{status:true}})` / `prisma.page.findUnique(...)` — and if it is `'published'` -> `throw new ForbiddenException('draft-only key cannot edit published content')` (404 if the row is missing, matching the service). This makes `works:write` mean create + edit DRAFT rows only; editing a published row, like publishing, requires `works:publish`.** Else return true. Log (without the raw key) which scope was missing on rejection.

> **Residual (documented, not blocked in v1):** `Chapter` has no `status` field, so chapter add/edit/reorder under a published work is *not* caught by clause 6. This is structural-only and low-risk; full coverage is the v2 versioning path (see Open questions). Pages under a published work that are themselves still `draft` remain editable — correct, since the reader serves published pages only.

**Verify:** Tests (step 13) matrix: JWT (['*']) PATCH status=published -> allowed AND all 3 DELETE routes -> allowed AND PATCH on a published work -> allowed (the regression gate the design omits); ApiKey ['works:write'] PATCH status=published -> 403 'draft-only key cannot publish'; same key DELETE /works/:id -> 403 'draft-only key cannot delete'; **same key PATCH title on an already-published work or page -> 403 'draft-only key cannot edit published content'; same key PATCH on a DRAFT work/page -> allowed;** ApiKey ['works:write','works:publish'] publish AND edit-published -> allowed; ApiKey on POST /auth/users and POST /api-keys -> 403; @Public reader route (GET via ReaderController) -> unaffected (ScopeGuard returns true at step 1). status:'PUBLISHED'/['published']/{} do NOT bypass into a successful publish.

### Step 8 — Register ScopeGuard after JwtAuthGuard and annotate routes
`api-auth`  ·  **deps:** #5, #7

**Files:** `apps/api/src/app.module.ts`, `apps/api/src/works/works.controller.ts`, `apps/api/src/pages/pages.controller.ts`, `apps/api/src/auth/auth.controller.ts`

**Change:** In app.module.ts providers, add `{ provide: APP_GUARD, useClass: ScopeGuard }` AFTER the existing JwtAuthGuard provider (line 35) — verified multiple APP_GUARDs run in registration order, so auth populates req.scopes/authType before ScopeGuard reads them. Annotate the content routes with @ContentRoute(): works.controller.ts POST /works (22), GET /works/:id (27), PATCH /works/:id (33), DELETE /works/:id (38), POST /works/:id/chapters (43), PATCH /chapters/:id (48), DELETE /chapters/:id (53); pages.controller.ts POST /chapters/:id/pages (10), GET /pages/:id (15), PATCH /pages/:id (21), DELETE /pages/:id (26). Add @JwtOnly() to auth.controller.ts POST /auth/users (35).

**Verify:** Boot the API: existing web flows (login, create/edit/publish/delete via Bearer JWT) all still work — the '*' short-circuit means zero behavior change for JWT callers. Curl with an ApiKey: POST /works succeeds (draft), PATCH status=published -> 403, DELETE -> 403, POST /auth/users -> 403.

### Step 9 — Add /api-keys service + controller (JWT-only) with scope-enum validation
`api-keys`  ·  **deps:** #4, #6, #8

**Files:** `apps/api/src/api-keys/api-keys.service.ts`, `apps/api/src/api-keys/api-keys.controller.ts`, `apps/api/src/api-keys/api-keys.module.ts`, `apps/api/src/api-keys/dto.ts`, `packages/shared/src/api-key.ts`, `packages/shared/src/index.ts`, `apps/api/src/app.module.ts`

**Change:** Shared (packages/shared/src/api-key.ts, exported from index.ts): apiKeyScopeSchema = z.enum(['works:write','works:publish','works:delete']); createApiKeySchema = { name: z.string().min(1).max(120), scopes: z.array(apiKeyScopeSchema).min(1).default(['works:write']) }; apiKeySummarySchema = { id, name, prefix, scopes, lastUsedAt nullable, revokedAt nullable, createdAt }; createApiKeyResponseSchema = apiKeySummarySchema.extend({ rawKey: z.string() }). Service: create() -> generateRawKey/hashKey/derivePrefix, store hashedKey+prefix+scopes+ownerUserId, return summary + rawKey ONCE (never persist raw); list(ownerUserId) -> select only non-sensitive fields (NEVER hashedKey/raw); revoke(id, ownerUserId) -> update revokedAt = new Date() scoped to owner. Controller decorate every handler @JwtOnly(): POST /api-keys, GET /api-keys, DELETE /api-keys/:id, using @CurrentUser().id as owner. Register ApiKeysModule in app.module.ts imports.

**Verify:** Tests + manual: POST /api-keys with a Bearer JWT returns { ...summary, rawKey } and rawKey re-hashes (sha256) to the stored hashedKey; GET /api-keys never includes hashedKey or rawKey; DELETE sets revokedAt and the key then 401s on the auth path (step 5). POST /api-keys with an ApiKey credential -> 403 (JwtOnly). POST /api-keys with scopes:['admin'] -> 400 (enum). A user cannot revoke another user's key (owner-scoped).

### Step 10 — Fix get_page echo fallback to a valid empty doc
`shared`  ·  **deps:** —

**Files:** `apps/api/src/works/serializers.ts`

**Change:** In toPage (serializers.ts:66) change the null-content fallback from `(p.content ?? { type: 'doc' })` to `(p.content ?? blankDoc())` importing blankDoc from '@blockpress/shared'. blankDoc() returns { type:'doc', content:[{type:'paragraph'}] }, a valid editable template, so the MCP get_page echo is always a usable read-modify-write base.

**Verify:** `pnpm --filter @blockpress/api run typecheck` passes. A page row with null content serialized via get_page returns a doc with a paragraph, not a bare {type:'doc'}. (Edge case in practice — all API-created pages already get blankDoc — but removes the malformed-template risk.)

### Step 11 — Add API Keys web UI (route + api client + sidebar entry)
`web`  ·  **deps:** #9

**Files:** `apps/web/src/routes/_app/api-keys.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/pages/LibraryPage.tsx`

**Change:** api.ts: add apiKeysApi = { list() -> GET /api-keys (schema z.array(apiKeySummarySchema)); create(name, scopes) -> POST /api-keys (schema createApiKeyResponseSchema); revoke(id) -> DELETE /api-keys/:id }, reusing the existing request() helper (Bearer auth + 401-refresh already wired, verified api.ts:76-114). New TanStack route _app/api-keys.tsx (file-based, under the existing /_app authed guard verified in _app.tsx): table of name/prefix/scopes/lastUsedAt/revokedAt with a revoke button (confirm dialog) and a Create button. On create, show rawKey EXACTLY ONCE in an ephemeral copy-to-clipboard modal; never write rawKey to localStorage/state/cookies beyond the modal lifetime. Wire the Sidebar.User card (Sidebar.tsx:64-77, currently static, has a ChevUpDown affordance) to navigate to /api-keys (and/or replace the LibraryPage Settings stub onClick).

**Verify:** `pnpm --filter @blockpress/web run typecheck` and a dev run: log in, open API Keys, create a key (raw shown once, copyable, gone after close), list shows prefix/scopes, revoke marks revokedAt and the key stops working. Grep confirms rawKey is never passed to any persistence call.

### Step 12 — Update docker app-init to regenerate the Prisma client
`shared`  ·  **deps:** #2

**Files:** `docker-compose.yml`

**Change:** Change the app-init command (docker-compose.yml:40) from `sh -c "pnpm exec prisma migrate deploy && pnpm exec ts-node prisma/seed.ts"` to `sh -c "pnpm exec prisma generate && pnpm exec prisma migrate deploy && pnpm exec ts-node prisma/seed.ts"`.

**Verify:** On an EXISTING stack (anonymous node_modules volume at lines 44/83 retains an old client), `docker compose --profile apps up` now regenerates the client at runtime so the new prisma.apiKey delegate exists and the auth/api-keys code doesn't throw at runtime. Fresh `--build` still works (build-time generate is harmless to repeat).

### Step 13 — Add the repo's first test harness + auth/scope/api-key tests
`api-auth`  ·  **deps:** #5, #7, #9

**Files:** `apps/api/package.json`, `apps/api/jest.config.js`, `apps/api/test/jwt-auth.guard.spec.ts`, `apps/api/test/scope.guard.spec.ts`, `apps/api/test/api-keys.e2e-spec.ts`

**Change:** Add Jest (+ @nestjs/testing, supertest, ts-jest) to apps/api devDeps and a test script (verified: zero tests/jest config exist today). Unit-test JwtAuthGuard (Bearer-valid/invalid, ApiKey-valid/revoked/unknown, malformed header, lastUsedAt failure non-fatal) and ScopeGuard (the full matrix in step 7, INCLUDING the design-omitted regression: a Bearer JWT still publishes AND deletes; and a schema-drift pin asserting publishStatusSchema.safeParse coupling so a future coercion change fails the test). E2e: POST /api-keys returns raw once + stores only hash; a works:write ApiKey gets 403 on POST /auth/users and POST /api-keys; revoked key -> 401.

**Verify:** `pnpm --filter @blockpress/api test` runs green. The wildcard-regression and schema-drift tests are present and passing (these are the load-bearing backward-compat guarantees the design's test list at lines 142-148 omits).

### Step 14 — Scaffold apps/mcp package (HTTP client + tools, no validate_content)
`mcp`  ·  **deps:** #9

**Files:** `apps/mcp/package.json`, `apps/mcp/tsconfig.json`, `apps/mcp/src/server.ts`, `apps/mcp/src/api-client.ts`, `apps/mcp/src/tools.ts`, `apps/mcp/.env.example`

**Change:** Name @blockpress/mcp v0.1.0. deps: @modelcontextprotocol/sdk ^1.29.0, zod ^3.25.0, @blockpress/shared workspace:*, a fetch/axios client; devDeps mirror apps/api (typescript 5.7.3, ts-node, @types/node, dotenv-cli). tsconfig extends ../../tsconfig.base.json but OVERRIDES module to commonjs, moduleResolution node, outDir dist (the base is ESNext; Node server needs commonjs like apps/api). package.json bin { blockpress-mcp: dist/server.js } with #!/usr/bin/env node shebang; dev script `dotenv -e ../../.env -- ts-node src/server.ts`. api-client.ts: inject `Authorization: ApiKey <BLOCKPRESS_API_KEY>` (NOT Bearer) on every call to BLOCKPRESS_API_URL; pass NestJS error `message` field through VERBATIM (so a 400 reads 'title must be <=200 chars', a 403 reads 'draft-only key cannot publish'); return tool failures as { content:[{type:'text', text:'Error: <message>'}], isError:true } (never throw). tools.ts: register exactly the design's tools MINUS validate_content -> list_works, get_work, create_work, update_work, add_chapter, update_chapter, get_page, add_page, update_page, each via registerTool(name, {title, description, inputSchema}, handler). Mirror server zod limits as .describe() strings (coverUrl/buyLink 'absolute http(s) URL, <=2000 chars'; title '1-200 chars'; year '<=12 chars'; tags '<=20, <=40 chars each'). update_page description carries the CORRECTED vocabulary (quote/callout/captionedImage/divider/table; NO blockquote/codeBlock; marks bold/italic/code/link) + a worked JSON example using quote and callout + the note that captionedImage.src must be an external http(s) URL (no upload tool) and that there is intentionally no publish/delete tool. create_work description instructs the agent to call get_work next for chapter/page ids (create returns a summary without ids — verified workSummarySchema has no chapters). server.ts uses StdioServerTransport and logs ONLY to stderr (stdout is the transport). .env.example lists BLOCKPRESS_API_URL, BLOCKPRESS_API_KEY.

**Verify:** `pnpm --filter @blockpress/mcp run build` (tsc) emits dist/server.js with shebang. With a local API + a real draft-only key: create_work returns a draft, list_works/get_work/get_page work, update_page persists, a forced publish attempt (raw PATCH) surfaces 'draft-only key cannot publish' as a tool error with isError:true. Confirm no stdout logging breaks the stdio transport.

### Step 15 — Write docs: mint a key, register the MCP server, content vocabulary
`docs`  ·  **deps:** #11, #14

**Files:** `apps/mcp/README.md`, `docs/plans/2026-06-02-draft-only-mcp-server-design.md`

**Change:** apps/mcp/README.md: env setup (BLOCKPRESS_API_URL/BLOCKPRESS_API_KEY), how to mint a key (web UI or `curl -H 'Authorization: Bearer <jwt>' POST /api-keys`), registering the server with Claude Desktop/Claude Code (stdio), the tool list + the CORRECTED content vocabulary with a worked example, and explicit statements that (a) there is intentionally NO publish/delete/validate_content tool in v1, (b) list_works status is read-only filtering not a publish affordance, (c) captionedImage needs an external URL. Update the design doc: append a 'v1 amendments' note recording the design_changes (default-deny inversion, validate_content deferred to v2 + dropped from v1 table, corrected vocabulary, authType/JwtOnly, scope-enum validation) so the doc and code don't diverge.

**Verify:** README renders; a fresh reader can mint a key and connect an agent host end-to-end following only the README. The design doc's tool table and vocabulary match what apps/mcp actually ships.

---

## Resolved decisions (2026-06-02)

- **✅ Editing already-published rows — BLOCKED.** There is no versioning in the schema
  (confirmed: `Work`/`Page` carry a single `status`, no version/history table), so there is
  no safe "land edits as a new draft version" path. Decision: a `works:write` key may edit
  **draft rows only**; editing a published `Work`/`Page` requires `works:publish` (same scope
  as publishing). Implemented as clause 6 of **Step 7**. *Future:* if versioning is added,
  editing published content could be re-enabled by creating a new draft version — that's the
  v2 unlock, not a v1 concern.
- **✅ ApiKey READ access — ALLOWED.** `get_work` / `get_page` stay enabled (GET works/pages
  routes annotated `@ContentRoute` in **Step 8**). Needed for read-modify-write and the
  `get_page` echo safety net.

## Open questions (still need a decision)

- **`validate_content` deferred to v2 — confirm acceptance.** v1 ships without an automated
  content-drop check, relying on corrected vocabulary + `get_page` echo + verbatim API-error
  pass-through. The v2 path is a React-free `@blockpress/editor-schema` package (node
  name/group/content/attrs; NodeViews stay in `apps/web`) so `apps/web` and `apps/mcp` share
  the exact schema `getSchema()` needs. Confirm the team accepts shipping v1 without it.
- **Key expiry (`expiresAt`) — optional follow-up.** The model has no `expiresAt`; `revokedAt`
  is the only kill switch, so a leaked key is valid until manually revoked. Out of scope per
  design YAGNI, but a time-boxed agent key is a small additive change (optional `expiresAt` +
  an auth-path check) if wanted.

---

## Suggested build waves (what can parallelize)

- **Wave A** (parallel, no deps): #1 Prisma model, #3 request types, #4 crypto helpers, #6 marker decorators, #10 get_page fallback.
- **Wave B**: #2 migration (←#1), #5 generalized auth guard (←#2,#3,#4), #7 ScopeGuard (←#3,#6), #12 docker generate (←#2).
- **Wave C**: #8 register+annotate (←#5,#7) → #9 /api-keys (←#4,#6,#8) → #13 tests (←#5,#7,#9).
- **Wave D** (parallel): #11 web UI (←#9), #14 apps/mcp (←#9).
- **Wave E**: #15 docs (←#11,#14).

Steps #5/#7/#8 all touch the guards + `app.module.ts`, so sequence them rather than running parallel worktrees.