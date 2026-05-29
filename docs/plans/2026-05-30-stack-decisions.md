# Stack decisions & version pins (verified 2026-05-30)

Pinned from a parallel research pass against the live npm registry + official docs.
These are non-obvious; read before changing dependencies.

## Versions

| Package(s) | Version | Notes |
| --- | --- | --- |
| Tiptap (`@tiptap/*`) | `^3.23.6` | All in lockstep. `@tiptap/core` + `@tiptap/pm` are **peer deps** — install explicitly under pnpm. |
| `@tiptap/extension-table` | `^3.23.6` | ONE package in v3 (bundles row/cell/header + `TableKit`). v2's 4 packages are gone. |
| Prisma | `^6` (classic) | **Deliberately NOT Prisma 7.** P7 is a rewrite: `prisma-client` generator + custom output path + required driver adapter (`@prisma/adapter-pg`) + `url` in `prisma.config.ts`. We use the battle-tested P6 pattern: `prisma-client-js`, `url` in datasource, `new PrismaClient()`, classic NestJS `PrismaService`. |
| Zod | `^3.25` | Satisfies `nestjs-zod@5`'s peer (`^3.25 \|\| ^4`), zero v4 migration risk, works with `@hookform/resolvers`. Single copy across workspace. |
| `nestjs-zod` | `^5.4` | `createZodDto` + `ZodValidationPipe`. `@nestjs/swagger` is an optional peer (not installed). |
| NestJS (`@nestjs/*`) | `^11` | `@nestjs/jwt@^11`. |
| Auth hashing | `bcryptjs@^3` | Pure JS, **no native build** (avoids `bcrypt` node-gyp friction in pnpm). |
| TanStack Router | `@tanstack/react-router@^1.170` + `@tanstack/router-plugin@^1.168` | **File-based routing** via the Vite plugin. |
| TanStack Query | `@tanstack/react-query@^5.100` | |
| S3 | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (same exact version) | Released in lockstep — keep identical. |

## Critical traps

1. **Drag-handle collab peers are INSTALL-required, not USAGE-required.**
   `@tiptap/extension-drag-handle@3.23.6` statically imports `@tiptap/y-tiptap` and
   `@tiptap/extension-collaboration` at module top. You MUST install
   `@tiptap/extension-drag-handle-react`, `@tiptap/extension-drag-handle`,
   `@tiptap/extension-node-range`, `@tiptap/extension-collaboration`,
   `@tiptap/y-tiptap` (its own line is **3.0.x**, not 3.23.6), `yjs`, `y-protocols`.
   But you do NOT add `Collaboration` to `extensions[]` and never create a `Y.Doc`.
   Plain reordering still works. pnpm needs a **single yjs copy** —
   `public-hoist-pattern[]=*yjs*` in `.npmrc` (and/or a `pnpm.overrides` on yjs).

2. **Tiptap v3 API renames / changes:**
   - `history` → `undoRedo` (StarterKit.configure({ undoRedo: false })).
   - `BubbleMenu`/`FloatingMenu` import from **`@tiptap/react/menus`** (not `@tiptap/react`).
   - StarterKit v3 bundles **Link + Underline** — do NOT install/register them separately.
   - `setContent(content, { emitUpdate })` (options object, not positional boolean).
   - `shouldRerenderOnTransaction` defaults **false** → read reactively via `useEditorState`,
     persist via `onUpdate`. Don't read `editor.getJSON()` inline in render (stale).
   - Slash menu: `@tiptap/suggestion` + **`@floating-ui/dom`** (`computePosition` + `posToDOMRect`).
     tippy.js is gone. The React popup (`ReactRenderer` + `CommandList`) MUST be
     `forwardRef` + `useImperativeHandle` exposing `onKeyDown`, or arrow/Enter nav breaks.
   - Custom node with attr-only data (image src/caption/align, divider variant) → `atom: true`.
     Editable inline text (callout body, quote body) → `content: 'inline*'` + `<NodeViewContent />`.

3. **CORS + credentials (cross-origin cookie):**
   refresh token is an httpOnly cookie. NestJS `enableCors({ origin: WEB_ORIGIN, credentials: true })`
   (wildcard `*` is rejected with credentials) AND the web fetch must use `credentials: 'include'`.
   Scope the refresh cookie to path `/auth/refresh`, mark that route `@Public()`, `secure` only in prod.

4. **S3/MinIO divergence:** `forcePathStyle: true` + `endpoint` for MinIO; omit both for AWS.
   Public URL: MinIO `${endpoint}/${bucket}/${key}` (path-style) vs AWS virtual-hosted.
   Sign `content-type`; the browser PUT must send the byte-identical `Content-Type`.
   AWS needs an explicit bucket CORS config + public-read policy (MinIO handled in compose).
