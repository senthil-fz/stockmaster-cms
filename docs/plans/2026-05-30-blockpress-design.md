# Blockpress — Design & Implementation Plan

_Date: 2026-05-30_

## 1. What we're building

**Blockpress** is a block-based editor for writing **books** and **articles**, recreated
from the Claude Design handoff bundle (`book-editor-ui`). The product has three surfaces:

1. **Library** — a card grid of all works (books & articles) with status, page/word counts,
   and All/Books/Articles/Drafts tabs. "New book" / "New article" create real, editable works.
2. **Editor** — a Notion-style block editor. The sidebar switches to a contextual
   **Book → Chapters → Pages** tree; the canvas is the writing surface; a right panel holds
   per-block settings and page meta/stats.
3. **Auth** — email/password sign in. Multiple users share **one editorial workspace**
   (not multi-tenant, no roles): everyone sees and edits every work.

Aesthetic: neutral, light, "Untitled UI" — warm-grey chrome, white canvas, near-black primary,
subtle borders/shadows. Tweakable accent color, light/dark, body font (sans/serif), editor width.

The prototype's block-JSON model is the **silent source of truth** — JSON is never shown to the
user; it just powers the editor underneath.

## 2. Key architectural decision: re-express the editor in Tiptap

The handoff README is explicit: recreate the *visual output*, don't port the prototype's internal
structure unless it fits. Here it doesn't — the 346-line hand-rolled reducer + HTML5 drag-and-drop
in `app.jsx`/`editor.jsx` should be **thrown away**, because:

> The design's block model **is already ProseMirror's model.** "Blocks ARE the JSON source of
> truth" is literally what `editor.getJSON()` returns.

So:

- **One Tiptap document per page**, persisted as a Prisma `Json` column on `Page.content`.
  Not a normalized `Block` table — that fights Tiptap's ownership of the doc and buys nothing.
- The reducer's insert/move/duplicate/remove → Tiptap **commands**.
- HTML5 DnD → **DragHandleReact** extension.
- Floating B/I/U/link toolbar → **BubbleMenu** (`@tiptap/react/menus`).
- Slash `/` menu → **Suggestion** utility (`@tiptap/suggestion`) + React popup.
- `+` button → insert at a position.
- Right panel is **selection-driven**: read the active node's attrs from
  `editor.state.selection`, write back with `editor.commands.updateAttributes(...)`.
- Denormalize `wordCount` per page so the library list view never loads full docs.

## 3. Tech stack

| Layer | Choice |
| --- | --- |
| Monorepo | pnpm workspaces: `apps/web`, `apps/api`, `packages/shared` |
| Frontend | React 18, Vite, TanStack Router, TanStack Query, React Hook Form + Zod resolver |
| Editor | Tiptap v3 (`@tiptap/react`, StarterKit, Table, Image, custom nodes) |
| Backend | NestJS, Prisma, PostgreSQL |
| Validation | Zod (shared), `nestjs-zod` (`createZodDto` + global `ZodValidationPipe`) |
| Auth | Email/password, bcrypt, JWT (access + httpOnly refresh) |
| Storage | S3 via AWS SDK v3 presigned PUT; endpoint-override → MinIO (dev) / AWS (prod) |
| Local infra | docker-compose: Postgres + MinIO |

**`packages/shared` is the keystone:** Zod schemas defined once → consumed by NestJS DTOs,
TanStack Query response parsing, and React Hook Form. Single source of truth for the wire shape.

## 4. Data model (Prisma)

```
User      id, email (unique), passwordHash, name, avatarColor, createdAt
Work      id, kind(BOOK|ARTICLE), title, subtitle, author, year, coverTone, coverUrl,
          status(DRAFT|PUBLISHED), tags(String[]), createdById, createdAt, updatedAt
Chapter   id, workId, title, order
Page      id, chapterId, title, content(Json = Tiptap doc), status(DRAFT|PUBLISHED),
          order, wordCount, updatedAt
```

- **Shared workspace**: queries do *not* filter by user. `createdById` is recorded for display
  only ("author"), never used to gate reads/writes.
- **Article = `kind:ARTICLE`** with exactly one chapter ("Article") and one page. Same schema,
  no special-casing in the data layer; the UI hides the chapter tree for single-page articles.
- Cascade deletes: Work → Chapters → Pages.

## 5. API surface (NestJS, REST)

All routes JWT-guarded by default (global guard); `@Public()` opt-out for `/auth/*`.
Bodies/params validated by global `ZodValidationPipe` against `createZodDto` schemas from shared.

```
POST   /auth/signup           { email, password, name } → { user, accessToken } (+refresh cookie)
POST   /auth/login            { email, password }       → { user, accessToken } (+refresh cookie)
POST   /auth/refresh          (refresh cookie)           → { accessToken }
POST   /auth/logout
GET    /auth/me                                          → { user }

GET    /works                  (?kind&status)            → Work summaries (no page content)
POST   /works                  { kind, title? }          → Work (seeded skeleton)
GET    /works/:id                                        → Work + chapters + page summaries
PATCH  /works/:id              { title, subtitle, tags, status, coverTone, ... }
DELETE /works/:id

POST   /works/:id/chapters     { title? }                → Chapter (+ first page)
PATCH  /chapters/:id           { title, order }
DELETE /chapters/:id

POST   /chapters/:id/pages     { title? }                → Page (seeded skeleton)
GET    /pages/:id                                        → Page (full content)
PATCH  /pages/:id              { title?, content?, status?, order? } → Page  (autosave target)
DELETE /pages/:id

POST   /uploads/presign        { filename, contentType, size } → { uploadUrl, publicUrl, key }
```

`PATCH /pages/:id` recomputes `wordCount` from `content` server-side (one shared walker over the
Tiptap doc, reused on the client for live stats).

## 6. Block → Tiptap node mapping (where pixel-fidelity lives)

| Design block | Tiptap node | Attributes | CSS class (from styles.css) |
| --- | --- | --- | --- |
| heading (level 1–3) | StarterKit `heading` | `level` | `.b-h1/.b-h2/.b-h3` via class on `<h1..3>` |
| paragraph | StarterKit `paragraph` | — | `.b-p` |
| list bullet/numbered | StarterKit `bulletList`/`orderedList` + `listItem` | — | `.b-list ul/ol/li` |
| quote (+citation) | **custom `quote`** node (text + `cite` attr) | `cite` | `.b-quote` + `.cite` |
| callout | **custom `callout`** node | `tone`, `icon` | `.b-callout.tone-*` + `.ico` |
| image (caption/align) | **custom `captionedImage`** node | `src`, `caption`, `align`, `label` | `.b-image.align-*` |
| divider | **custom `divider`** node (or HR variant) | `variant` (line/dots) | `.b-divider`/`.dots` |
| table | `@tiptap/extension-table` (+ row/cell/header) | `header` toggle via header row | `.b-table` |

Marks: bold/italic/underline/link from StarterKit (+ `@tiptap/extension-underline`,
`@tiptap/extension-link`). The prototype's `document.execCommand` is replaced by real Tiptap marks
serialized into the doc JSON (this is the "named JSON marks" the prototype flagged as missing).

**Slash catalog** mirrors `BLOCK_CATALOG` in `data.jsx` (H1–H3, Text, Bulleted/Numbered list,
Quote, Callout, Image, Table, Divider) with the same icons, titles, descriptions, keywords.

## 7. Component composition (compound components)

Per the user's explicit request, the major surfaces are **compound components** (Context-backed,
dot-notation subcomponents) — see `vercel-composition-patterns`:

- `Sidebar` — `Sidebar.Brand`, `Sidebar.Nav`, `Sidebar.NavItem`, `Sidebar.BookTree`,
  `Sidebar.Chapter`, `Sidebar.Page`, `Sidebar.User`. Context carries collapse state + active page.
- `Library` — `Library.Hero`, `Library.Tabs`, `Library.Grid`, `Library.Card`.
- `Topbar` — `Topbar.Breadcrumbs`, `Topbar.Crumb`, `Topbar.SaveState`, `Topbar.Actions`.
- `Panel` — `Panel.Head`, `Panel.Section`, `Panel.Field`, `Panel.Seg`, `Panel.Stat`. The panel
  body switches between `BlockSettings` (selection-driven) and `PageSettings`.
- `Editor` — `Editor.Canvas`, `Editor.Title`, `Editor.SlashMenu`, `Editor.BubbleToolbar`,
  `Editor.DragHandle`. Wraps the Tiptap instance via a `useBlockEditor` hook + context.

Design tokens from `styles.css` are ported verbatim into a single `tokens.css` (CSS custom
properties: surfaces, text, lines, primary, accent, radii, shadows, fonts) + the component styles.

## 8. Persistence, autosave, theming

- **Autosave**: `PATCH /pages/:id` debounced (~800ms) on Tiptap `onUpdate`, driven by a TanStack
  Query mutation. Topbar `Saved / Saving… / Unsaved changes` maps to mutation state (`isPending`,
  `isError`, dirty flag). Explicit "Save as draft" / "Publish changes" set `page.status`.
- **Optimistic** tree edits (add chapter/page, rename) via `onMutate` cache updates.
- **Theming/tweaks**: accent / dark / body-font / editor-width are real product prefs stored in
  client state (localStorage), applied as `data-theme` / `data-content-font` / `--accent` /
  `--content-width` on `<html>` — exactly as the prototype's `useTweaks` effect did. The
  prototype's `__edit_mode` host-protocol plumbing in `tweaks-panel.jsx` is design-tool chrome and
  is **dropped**; the values become a small Settings/Appearance control.

## 9. Out of scope (prototype stubs, not requested)

`Reporting`, `Authors`, `Settings`, `Trash` are dead `onClick={()=>{}}` stubs in the prototype —
left as non-functional nav entries (or omitted) unless asked. Desktop-only, matching the design.
Real-time collaboration, comments, AI, JSON inspector, cover-image upload, chapter drag-reorder:
deferred.

## 10. Build order

1. Scaffold monorepo + docker-compose (Postgres, MinIO).
2. `packages/shared` Zod schemas (wire contracts).
3. Prisma schema + migration + seed (port `data.jsx` content).
4. NestJS: auth → works/chapters/pages → uploads.
5. Web shell: router, query client, auth, theme.
6. Tiptap editor + custom nodes + menus.
7. Library / Sidebar / Topbar / Panel compound components, port CSS.
8. Wire autosave/publish, verify end-to-end, README.
