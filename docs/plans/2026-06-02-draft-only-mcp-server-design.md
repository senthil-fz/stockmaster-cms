# Draft-only MCP server — design

**Date:** 2026-06-02
**Status:** Approved — but **superseded in part** by the verified implementation plan.

> **⚠️ v1 amendments (2026-06-02).** A multi-agent adversarial review of this design found
> the enforcement model was *fail-open* and several documented details were wrong. Before
> implementing, read [2026-06-02-draft-only-mcp-server-implementation-plan.md](./2026-06-02-draft-only-mcp-server-implementation-plan.md),
> which overrides this doc on these points:
> 1. **Enforcement is default-deny, not opt-in.** Generalizing the global guard makes every
>    authenticated route ApiKey-reachable; opt-in `@RequireScope` would have let a draft-only
>    key hit `POST /auth/users` and `POST /api-keys` (create users, mint a full-scope key).
>    The `ScopeGuard` now denies ApiKey principals everywhere except an explicit content
>    allowlist, and still 403s publish/delete within it.
> 2. **Publish check is body/method-driven** and derived from `publishStatusSchema.safeParse`
>    (guards run before the validation pipe), not a raw string compare.
> 3. **`validate_content` ships in v1** via a new React-free `@stockmaster/editor-schema`
>    package (a later verification reversed the initial deferral). Tiptap v3 + ProseMirror
>    ship dual ESM/CJS and `getSchema` runs headless, so `apps/mcp` imports the *same* schema
>    `apps/web` uses — no hand-copy. Backs the vocabulary + `get_page` echo with an automated
>    content-drop + invalid-attr check. Residual: `callout.icon` name validity unchecked.
> 4. **The documented content vocabulary below is wrong** — `blockquote`/`codeBlock` are
>    disabled in the editor; real nodes are `quote`, `callout`, `captionedImage`, `divider`,
>    `table`. See the plan for the corrected set.
> 5. **Editing already-published rows is blocked** (no versioning exists). A `works:write`
>    key may edit draft `Work`/`Page` rows only; editing a published row requires
>    `works:publish`. The key **may read** (`get_work`/`get_page` stay enabled).

## Goal

Expose a Model Context Protocol (MCP) server that lets an AI agent **create and edit
articles and books**, but **only ever in `draft` state** — it must be physically unable
to publish (flip `status` to `published`) or delete content, even if the MCP client is
buggy or compromised.

## Decisions (locked)

| Question | Decision |
|---|---|
| Enforcement | Server-side, authoritative. New scoped API key checked by the NestJS API. MCP-side omission is a secondary, ergonomic layer. |
| Transport | MCP server calls the existing REST API over HTTP. No direct DB access. |
| Identity | API key is owned by a real `User`; drafts are authored by that user. The credential itself is restricted. |
| On publish attempt | API returns **403 Forbidden**. Nothing is silently changed. |
| On delete attempt | API returns **403 Forbidden**. The draft-only key has create + edit only. |
| Key management | REST endpoints (`/api-keys`) **and** a web UI in `apps/web`. |
| Page content format | Raw TipTap JSON, de-risked (see Content section). |

## Architecture

New monorepo package **`apps/mcp`** — a standalone MCP server (Node + TypeScript,
`@modelcontextprotocol/sdk`, **stdio** transport) launched locally by the agent host
(Claude Desktop / Claude Code). Config via env:

- `STOCKMASTER_API_URL` — base URL of the NestJS API
- `STOCKMASTER_API_KEY` — the raw draft-only key

The MCP server never touches Postgres. Every tool maps to an existing REST endpoint,
reusing all validation, serializers, word-count, and read-tracking logic.

### Two enforcement layers

1. **API layer (authoritative).** A scoped `ApiKey` carries `works:write` only.
   Publishing requires `works:publish` and deleting requires `works:delete` — neither
   present — so both are rejected with 403 in the API regardless of client.
2. **MCP layer (ergonomic).** The MCP tools expose no publish/status/delete surface, so
   the agent never forms such a request. The 403 is the backstop, not the primary UX.

## API-side changes (NestJS + Prisma)

### Prisma — new model

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  name        String                    // "MCP draft agent"
  hashedKey   String    @unique         // sha256 of the raw key
  prefix      String                    // first 8 chars, shown in UI for identification
  scopes      String[]  @default([])    // e.g. ["works:write"]
  ownerUserId String
  owner       User      @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())
}
```

Add `apiKeys ApiKey[]` to `User`. One migration.

### Auth — credential resolution

Generalize the global guard so `Authorization:` accepts either:

- `Bearer <jwt>` (unchanged) → `req.user = { id, email }`, `req.scopes = ['*']`
- `ApiKey <raw>` → sha256 the raw value, look up `hashedKey`; reject if missing or
  `revokedAt` set; fire-and-forget `lastUsedAt` update; set
  `req.user = { id: ownerUserId }`, `req.scopes = key.scopes`.

JWT requests keep full access (`['*']`) — existing behavior preserved.

### Scope guard

A small `ScopeGuard` (runs after auth) enforces required scopes on write handlers:

- `PATCH /works/:id`, `PATCH /pages/:id` — if the DTO sets `status: 'published'` and
  scopes lack `works:publish` → **403** (`'draft-only key cannot publish'`).
- `DELETE /works/:id`, `DELETE /chapters/:id`, `DELETE /pages/:id` — if scopes lack
  `works:delete` → **403**.
- `create` routes always default to draft, so they need no special handling.

JWT callers (`['*']`) pass all checks unchanged.

### Key management

JWT-only endpoints (API keys cannot mint keys):

- `POST /api-keys` → returns the **raw key once**; stores only the hash.
- `GET /api-keys` → list (name, prefix, scopes, lastUsedAt, revokedAt).
- `DELETE /api-keys/:id` → sets `revokedAt` (soft revoke).

A small settings screen in `apps/web` to create / view / revoke keys, showing the raw
key exactly once on creation.

## The MCP server (`apps/mcp`)

A thin typed HTTP client injects `Authorization: ApiKey <key>` on every call and
surfaces API errors (especially 403) as readable tool errors.

### Tools (no publish/status/delete surface)

| Tool | REST mapping |
|---|---|
| `list_works({ kind?, status? })` | `GET /works` |
| `get_work({ id })` | `GET /works/:id` (full chapter/page tree) |
| `create_work({ kind, title? })` | `POST /works` (always draft) |
| `update_work({ id, title?, subtitle?, author?, year?, tags?, coverTone?, coverUrl?, buyLink? })` | `PATCH /works/:id` |
| `add_chapter({ workId, title? })` | `POST /works/:id/chapters` |
| `update_chapter({ id, title?, order? })` | `PATCH /chapters/:id` |
| `get_page({ id })` | `GET /pages/:id` — **returns stored content** |
| `add_page({ chapterId, title? })` | `POST /chapters/:id/pages` |
| `update_page({ id, title?, content?, order? })` | `PATCH /pages/:id` |
| `validate_content({ content })` | local — round-trips through ProseMirror schema, reports drops |

Tool descriptions state the draft-only nature explicitly (e.g. "creates a DRAFT
article; it cannot be published through this tool").

### Content: raw TipTap JSON, de-risked

Page `content` is a TipTap (ProseMirror) document. The on-wire Zod schema
(`packages/shared/src/tiptap.ts`) is deliberately loose — it accepts any `type: string`
and any `attrs`, so malformed docs persist silently and then get normalized/dropped when
the page opens in the editor. Three mitigations:

1. **Vocabulary in the tool description.** `update_page` documents the supported set:
   `doc → paragraph / heading[level] / bulletList / orderedList / listItem / blockquote
   / codeBlock / text + marks[bold, italic, code, link{href}]`, with a worked example.
   Note marks (bold/italic/link) attach to text nodes — they are not node types.
2. **`get_page` echoes stored content** so the agent can read-modify-write against a real
   example instead of inventing structure.
3. **`validate_content` tool** round-trips a doc through ProseMirror's actual schema and
   reports any nodes/marks that would be dropped — catches silent-normalization cases
   before they reach the editor.

## Testing

- **API unit/e2e:** ApiKey auth resolution (valid / revoked / unknown); `ScopeGuard`
  returns 403 on publish via draft-only key and on all delete routes; JWT path unchanged;
  `POST /api-keys` returns raw once and stores only the hash.
- **MCP:** client injects the header; 403 surfaces as a clear tool error; `create_work`
  produces a draft; `validate_content` flags a doc with an unknown node type.
- **Manual:** run the MCP against a local API with a real key; create an article, edit a
  page, attempt a publish (expect 403), confirm the draft appears in `apps/web`.

## Rollout

1. Prisma migration + `ApiKey` model.
2. Auth guard generalization + `ScopeGuard` + apply markers to write routes.
3. `/api-keys` endpoints + web UI.
4. `apps/mcp` package: HTTP client + tools + `validate_content`.
5. Docs: how to mint a key and register the MCP server with an agent host.

## Research notes — validated technical details (2026-06-02)

### MCP SDK surface (confirmed current)

`@modelcontextprotocol/sdk` (TypeScript). Server shape:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'stockmaster-draft', version: '0.1.0' });

server.registerTool(
  'create_work',
  {
    title: 'Create draft work',
    description: 'Creates a DRAFT book or article. It CANNOT be published through this tool.',
    inputSchema: z.object({
      kind: z.enum(['book', 'article']),
      title: z.string().min(1).max(200).optional(),
    }),
  },
  async ({ kind, title }) => {
    const work = await api.post('/works', { kind, title });
    return { content: [{ type: 'text', text: JSON.stringify(work) }] };
  },
);

await server.connect(new StdioServerTransport());
```

Use `registerTool(name, { description, inputSchema }, handler)` (the v2 API; the older
variadic `server.tool(...)` is deprecated). `.describe()` each Zod field — those strings
reach the agent. Confirm the exact import subpaths at install time; the SDK has been
renaming packages (`@modelcontextprotocol/server` appears in some docs branches).

### `validate_content` — the real technique

Build the **same** ProseMirror schema the web editor uses, deserialize, and diff:

```typescript
import { getSchema } from '@tiptap/core';
import { Node } from 'prosemirror-model';
// editorExtensions: the SAME extension list apps/web registers on the editor.
const schema = getSchema(editorExtensions);
const node = Node.fromJSON(schema, doc);  // silently DROPS nodes that don't fit
node.check();                              // throws on structural inconsistency
const roundTripped = node.toJSON();
// deep-diff(doc, roundTripped) → anything in `doc` but not in `roundTripped` was dropped.
```

ProseMirror discards non-conforming content during `fromJSON`, so a deep-diff of input
vs. `node.toJSON()` is what surfaces the silent drops. **Critical dependency:** the
validator must use the editor's exact extension set — otherwise it validates against the
wrong schema. Action item: extract the editor's extension list into a shared module
(`packages/shared` or a small `@stockmaster/editor-schema` package) imported by both
`apps/web` and `apps/mcp`. If that extraction is too invasive for v1, `validate_content`
can ship in a later iteration and v1 relies on the documented vocabulary + `get_page`
echo (the two cheaper mitigations).

Sources: [MCP TS SDK README](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md),
[Tiptap server-side validation discussion #4454](https://github.com/ueberdosis/tiptap/discussions/4454),
[Tiptap Schema docs](https://tiptap.dev/docs/editor/core-concepts/schema),
[ProseMirror Guide](https://prosemirror.net/docs/guide/).

## Out of scope (YAGNI for v1)

- Per-work / per-collection key scoping (all-or-nothing draft write for now).
- Rate limiting on the API-key path beyond what already exists.
- Native attestation / key rotation automation.

---

## v1 amendments (as built — 2026-06-02)

This section records how v1 actually shipped so this design doc and the code do not diverge.
It supplements (and is the authoritative resolution of) the warning banner at the top. Full
detail lives in [the implementation plan](./2026-06-02-draft-only-mcp-server-implementation-plan.md).

- **Enforcement inverted to default-deny.** `ScopeGuard` runs after the (generalized) global
  auth guard with a fixed decision order: `@Public` → allow; `req.scopes` includes `'*'` (JWT)
  → allow; otherwise an ApiKey principal is **denied everywhere except an explicit `@ContentRoute`
  allowlist** (the 9 works/pages/chapters routes). This replaces the original opt-in
  `@RequireScope` model, which was fail-open (a forgotten marker on a new status/delete route
  would have silently allowed it) and would have left `POST /auth/users` / `POST /api-keys`
  ApiKey-reachable.
- **Publish check is body/method-driven, pinned to `publishStatusSchema`.** Inside the content
  allowlist, `wantsPublish = (PATCH) && publishStatusSchema.safeParse(req.body?.status).success
  && parsed === 'published'`; `wantsDelete = (method === 'DELETE')`. Guards run before the
  validation pipe, so the check is bound to the same zod schema as persistence (not a raw string
  compare) and is guarded against non-object bodies.
- **Editing already-published rows is blocked (no versioning exists).** A `works:write` key may
  create + edit **draft** `Work`/`Page` rows only; a `PATCH` on an already-`published` row (like a
  publish transition) requires `works:publish`. Implemented as a published-row guard that reads
  the target's current `status`. *Residual:* `Chapter` has no `status`, so chapter structural
  edits under a published work are not caught — structural-only, low-risk, deferred to a future
  versioning path.
- **`authType` + `@JwtOnly`.** The auth guard records `req.authType` (`'jwt' | 'apikey'`).
  `@JwtOnly()` routes (`POST /auth/users`, the `/api-keys` routes) reject ApiKey principals,
  making the JWT-only contract explicit on top of default-deny.
- **`/api-keys` scope-enum validation.** `apiKeyScopeSchema = z.enum(['works:write','works:publish',
  'works:delete'])`; a caller can never mint a `['*']`/`['admin']` key. The raw key is returned
  **once** (only its sha256 hash is stored).
- **`validate_content` ships in v1.** Backed by the new React-free `@stockmaster/editor-schema`
  package — `apps/mcp` calls `getSchema(schemaExtensions)` (headless, no DOM/jsdom) and runs
  `nodeFromJSON → check → round-trip drop-diff + a Zod enum overlay` (catches invalid `callout.tone`
  / `divider.variant` / `captionedImage.align` the round-trip can't see). The schema is **imported,
  never hand-copied.** *Residual:* `callout.icon` name validity is unchecked (the icon registry
  lives in `apps/web`).
- **Content vocabulary corrected.** `blockquote`/`codeBlock` are **disabled** in the editor and do
  **not** exist; the real custom nodes are `quote`, `callout`, `captionedImage`, `divider`, plus the
  `table` family. The corrected set (with a worked example) is advertised on `update_page` and in
  `apps/mcp/README.md`.
- **`expiresAt` (optional key time-box).** Additive nullable column; `revokedAt` remains the
  primary kill switch. The auth guard 401s an expired key (`'expired API key'`), and minting with a
  past `expiresAt` is rejected (400). The web mint form must emit a UTC/ISO-with-offset instant to
  avoid clock-skew.
- **MCP module format.** `apps/mcp` is a standalone CommonJS Node package (`module:commonjs`,
  `moduleResolution:node`, `esModuleInterop`, `allowSyntheticDefaultImports`) that does **not**
  extend `tsconfig.base.json` (the base is ESNext/Bundler — incompatible); it mirrors
  `apps/api/tsconfig.json`. The MCP SDK + Tiptap ship CJS entries, so `require()` interop works.
- **MCP tool surface.** Exactly 10 tools: `list_works`, `get_work`, `create_work`, `update_work`,
  `add_chapter`, `update_chapter`, `get_page`, `add_page`, `update_page`, `validate_content`. There
  is intentionally **no publish/status/delete tool**, and `update_work`/`update_page` omit `status`.
  `inputSchema` is registered as a raw `ZodRawShape` (the SDK wraps it in `z.object()` internally) —
  the `z.object(...)` form shown in the Research notes example is illustrative, not the literal API.
