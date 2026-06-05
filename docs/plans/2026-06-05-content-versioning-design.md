# Content Versioning — design

**Date:** 2026-06-05
**Status:** Implemented (pending review + deploy). Gates green (typecheck 8/8, 65 API tests, build
5/5, `prisma validate`). Migration + backfill verified on a real DB: applies clean, status columns
dropped, one v1 per previously-published entity (published pages/non-empty chapters only), drafts
left unpublished, and `migrate diff` shows **zero drift** from `schema.prisma`.

## Goal

Give books and articles a **published-version / working-draft** split:

- At any time, **at most one published version** of a book or article is served to the public.
- Editors keep editing a **working draft** without touching what the public sees.
- When ready, **publish** atomically swaps the live version to the current draft.
- Every publish is retained as an **immutable version** — full history, with rollback.

## Mechanism (chosen architecture)

**Entity-level immutable JSON snapshots + a published pointer; the live relational tree stays
the working draft; the reader is served from the snapshot.**

- The existing `Book → Chapter → Page` tree (and `Article.content`) remains the **editable
  working draft**. All current editor endpoints keep mutating it in place.
- A new immutable **`BookVersion` / `ArticleVersion`** row stores a complete, self-contained
  JSON **snapshot** of the content at publish time.
- `Book.publishedVersionId` / `Article.publishedVersionId` point at the one live version.
  **`publishedVersionId != null` is the sole source of truth for "publicly visible."**
- **Publish** = one transaction: serialize the current draft → insert a new version row with
  the next `versionNumber` → set the pointer → clear the dirty flag.
- The **reader serves the snapshot JSON**, never the live tree. Frozen content + frozen page
  numbering, immune to in-progress draft edits.

Rejected: per-page versioning (explodes complexity, makes "one published version" ambiguous);
duplicate draft+published trees (doubles rows, ID churn on every publish).

## Schema changes

```prisma
model BookVersion {
  id            String   @id @default(cuid())
  bookId        String
  book          Book     @relation("BookVersions", fields: [bookId], references: [id], onDelete: Cascade)
  versionNumber Int                       // monotonic per book, starts at 1
  snapshot      Json                      // self-contained, see "Snapshot schema"
  schemaVersion Int      @default(1)      // snapshot envelope version
  wordCount     Int      @default(0)
  pageCount     Int      @default(0)
  note          String?                   // optional editor note ("fixed typos in ch.3")
  createdById   String?
  createdBy     User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt     DateTime @default(now())

  @@unique([bookId, versionNumber])
  @@index([bookId, createdAt])
}

model Book {
  // … existing fields …
  publishedVersionId String?      @unique
  publishedVersion   BookVersion? @relation("BookPublished", fields: [publishedVersionId], references: [id], onDelete: SetNull)
  draftDirty         Boolean      @default(false)  // draft has edits not yet published
  versions           BookVersion[] @relation("BookVersions")
}
```

`ArticleVersion` is the analogue (no `pageCount`; snapshot holds the single TipTap doc).

**Prisma two-relation rule:** `Book` ↔ `BookVersion` now has *two* relations — the
one-to-many history (`"BookVersions"`) and the one-to-one published pointer (`"BookPublished"`).
Both must be explicitly named with `@relation("…")` on each side or the schema won't compile.
Same for `Article`.

### Status field — resolving the dual source of truth

A binary `draft | published` enum **cannot express the state that matters most here:
*published AND has newer draft edits.*** So we stop writing it:

- **`status` is removed from the editor write path.** `PATCH /books/:id` (and article) no longer
  accept `status`. Visibility changes ONLY through `publish` / `unpublish`.
- **`status` stays in responses, derived** from the pointer (`publishedVersionId ? 'published'
  : 'draft'`). This keeps `publishStatusSchema`, the web status tabs, and MCP read filters
  stable — no churn in shared types or MCP.
- A new **`hasUnpublishedChanges: boolean`** (from `draftDirty`) is added to **editor** responses
  so the CMS can show "published, with unpublished edits." It is **stripped from the public reader
  response** — editorial state must never leak through the reader surface.
- `Book.status` / `Article.status` columns are dropped (value is fully derived). `Page.status`
  **stays** — it is the editorial "include this page on publish" staging flag (see below).

### `draftDirty`, not timestamps

Do **not** infer unpublished changes from `updatedAt > version.createdAt` — publishing itself
bumps `updatedAt`, an immediate false positive. Instead: every existing draft mutation already
calls `touchBook` (or updates the article); those sites also set `draftDirty = true`. The publish
transaction clears it. Article edits set `draftDirty` on the article directly.

## Snapshot schema (immortal — design deliberately)

These blobs must be readable years from now, so they store the **already-filtered,
already-ordered reading structure**, not raw Prisma rows:

```jsonc
// BookVersion.snapshot  (schemaVersion: 1)
{
  "book": { "title", "subtitle", "author", "year", "coverTone", "coverUrl", "buyLink", "tags", "slug" },
  "chapters": [
    { "id", "title", "order",
      "pages": [ { "id", "title", "order", "wordCount", "content": <TiptapDoc> } ] }
  ]
}
```

- **Only `Page.status === 'published'` pages are captured**, in `(chapter.order, page.order)`
  order — exactly what readers see today, preserving behavior.
- **Real live `Page.id`s are preserved** in the snapshot. `ReadEvent.pageId` is a loose string
  (not an FK); keeping real ids means read-tracking and `stats.service` joins keep working, and
  the existing "since-deleted page" tolerance covers ids that later vanish from the draft.
- Reader page-numbering becomes a trivial sequential walk over `snapshot.chapters[*].pages` —
  frozen, consistent numbering.

`ArticleVersion.snapshot`: `{ "article": {…metadata}, "content": <TiptapDoc>, "wordCount" }`.

## API surface (all under `/v1/admin`, gated by `content:publish`)

| Method | Route | Action |
|---|---|---|
| `POST` | `/books/:id/publish` | Snapshot draft → new version → set pointer → clear dirty. Body: `{ note? }`. |
| `POST` | `/books/:id/unpublish` | Set `publishedVersionId = null` (pulls book from public). |
| `GET`  | `/books/:id/versions` | History (version metadata, no full content). |
| `GET`  | `/books/:id/versions/:versionId` | One version's full snapshot (preview / diff). |
| `POST` | `/books/:id/versions/:versionId/restore` | **Rollback** — repoint published to an older version. |

Same five for articles. The mutating transitions `publish`/`unpublish`/`restore` require
`content:publish` (`ScopeGuard` clause 5 matches `POST …/(publish|unpublish|restore)`); the
read-only `GET …/versions` history is a content read, reachable by any `content:write` key. The
existing `content:write` keys (incl. all MCP draft-only keys) **cannot** publish.

### Draft editing is no longer gated (ScopeGuard clause 6 removed)

The old guard blocked a `content:write` key from editing already-*published* books/articles/pages
("no versioning exists, so editing live content changes what the public sees"). Under versioning
that premise is false: the live tree is a **private working draft** and the public is served the
frozen snapshot, so a draft edit changes nothing public — only `publish` does, and that stays
gated. Clause 6 is therefore **removed entirely**: draft-only keys (MCP) may now edit the draft of
a published work, which is the whole point of the feature. The guard no longer reads the DB.

**Rollback semantics (MVP):** `restore` = *repoint the published pointer to an existing older
version*. Public reverts atomically; the working draft is left untouched. (The separate
operation "overwrite the draft tree from a snapshot" is deliberately **out of scope** for v1.)

## Reader changes (`reader.service.ts`)

Stop traversing the live tree filtered by `status`; read the published snapshot instead:

- `listBooks` → books where `publishedVersionId != null`; summary built from
  `publishedVersion` (`wordCount` / `pageCount` columns, plus book metadata).
- `getBook` / `getBookPage` → load `publishedVersion.snapshot`, walk `snapshot.chapters[*].pages`
  for structure, numbering, and page content. Read-tracking (`trackPageRead`) unchanged — still
  writes `ReadEvent` with the (snapshot-preserved) real `pageId`.
- HMAC contract and routes (`/v1/books`, `/v1/books/:id`, `/v1/books/:id/pages/:pageno`) are
  **byte-identical** — only the data source behind them changes.

## Web (CMS) changes

- **`EditorPage.tsx`** — replace the status toggle with **Publish / Unpublish** actions; show a
  **"unpublished changes"** badge from `hasUnpublishedChanges`.
- **`ArticleSettings.tsx` / `PageSettings.tsx`** — drop the writable `status` control (status is
  now derived); `Page.status` staging control stays for books.
- **New version-history panel** — lists versions from `GET …/versions`, with a **Restore** action.
- **`LibraryPage.tsx` / `Library.tsx`** — status tabs keep working off the derived `status`.
- **`lib/api.ts`** — add `publishBook/unpublishBook/listVersions/restoreVersion` (+ article
  equivalents); remove `status` from update payloads.

## MCP changes

Effectively none. MCP is draft-only by design (no publish/status/delete tools) and only *reads*
`status` for filtering — which still works because `status` stays in responses. Verify its
`update` flows don't send `status` (they already omit it).

## Migration (behavior-preserving backfill)

1. Add tables, pointers, `draftDirty`; **drop `Book.status` / `Article.status` columns**.
2. **Backfill:** for every book/article that was `status = 'published'`, create `versionNumber = 1`
   from its current published-status pages (book) / current content (article) and set
   `publishedVersionId`. Drafts get a null pointer (correctly not public).
3. `draftDirty` defaults `false` (a freshly-published entity is clean).

A reversible Prisma migration + a one-off data backfill step (raw SQL or a script run inside the
migration). Must run before the new reader/editor code goes live.

## Invariants

- **Exactly one published version** per entity — enforced by a single nullable `publishedVersionId`.
- **Publishing is atomic** — snapshot insert + pointer update + dirty-clear in one transaction.
- **Public visibility == `publishedVersionId != null`** — the only source of truth.
- **Versions are immutable** — never updated or deleted by editor flows (only `restore` repoints).
- **Snapshots are self-contained** — readable without the live tree; carry `schemaVersion`.
- **`content:publish` gates all version mutations** — draft-only keys can never publish.

## Verification gates (per workflow phase)

1. Schema + migration: `prisma migrate` applies on a clone of prod data; backfill produces one
   v1 per previously-published entity; drafts stay unpublished.
2. Publish/unpublish/restore endpoints: unit tests — atomic swap, dirty flag, scope enforcement.
3. Reader rewrite: `/v1/books*` serve snapshot content; numbering matches pre-change output for
   a published fixture; draft edits do **not** leak to the reader.
4. Web + MCP: `pnpm typecheck` clean across all workspaces; MCP sends no `status`.
5. Full gate: `pnpm typecheck` + API tests green before ship.

## Open decision for sign-off

The **status field resolution** (drop the writable column; keep `status` derived in responses;
add `hasUnpublishedChanges`) is the one product-visible choice. Everything else is mechanical.
