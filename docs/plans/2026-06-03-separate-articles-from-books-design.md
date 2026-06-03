# Separate Articles from Books (+ rename Work → Book)

**Date:** 2026-06-03
**Status:** Implemented + verified (DB/API/MCP proven E2E; web UI statically verified, visual pass pending)

## Problem

A single `Work` model carries a `kind` discriminator (`book` | `article`) and a
`Work → Chapter → Page` tree. An **article is a crippled book**: forced into a one‑chapter,
one‑page tree, with UI guards (`work.kind === 'book'`) hiding chapter management. Every layer carries
`kind` branching for a type that is conceptually just *a single page of content*. And once articles
leave, `Work` is always a book — so the name `Work` is wrong.

**Goals:**
1. Articles become a first‑class, standalone, **single‑page** content type — no chapters/pages.
2. `Work` is renamed to **`Book`** everywhere (it is always a book now).

## Decisions (settled with the user)

- **Standalone `Article` table**, single TipTap `content` JSON. No chapter/page tree.
- **ID strategy = additive.** `Article` uses a **native Postgres `uuid`** PK
  (`@db.Uuid @default(dbgenerated("gen_random_uuid()"))`) + unique `slug`. Existing
  `Book`/`Chapter`/`Page` **keep their `cuid` PKs** (already unique & URL‑safe) but `Book` **gains a
  nullable unique `slug`**. Existing IDs are untouched.
- **`Work` → `Book`, full rename.** Prisma model, **DB table `"Work"`→`"Book"`**, **FK columns
  `workId`→`bookId`** (on `Chapter` and `ReadEvent`), internal modules/types/vars, **REST routes
  `/works`→`/books`**, MCP tools (`create_work`→`create_book`, etc.).
- **`kind` removed.** Drop the `Work.kind` column, the `WorkKind` enum, and `@@index([kind])`.
- **Scopes `works:*` → `content:*`** (governs both books and articles), with a **data migration that
  rewrites existing `ApiKey.scopes`** so the existing draft‑only key keeps working (now
  `content:write`). Article write/publish/delete reuse the same default‑deny `ScopeGuard`, so the
  draft‑only key **creates draft articles** and **403s on article publish/delete**.

## Data model (final schema)

```prisma
// REMOVED: enum WorkKind

model Book {                         // was `Work`
  id        String  @id @default(cuid())          // cuid PK unchanged
  slug      String? @unique                        // NEW — backfilled for the 4 books
  title     String
  subtitle  String  @default("")
  author    String  @default("")
  year      String  @default("")
  coverTone String  @default("default")
  coverUrl  String?
  buyLink   String?                                // book‑only (now unambiguous)
  status    PublishStatus @default(draft)
  tags      String[] @default([])
  createdById String?
  createdBy User? @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  chapters   Chapter[]
  readEvents ReadEvent[]
  @@index([status])                                // kind index removed
}

model Article {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug        String        @unique
  title       String
  subtitle    String        @default("")
  author      String        @default("")
  year        String        @default("")
  coverTone   String        @default("default")
  coverUrl    String?
  tags        String[]      @default([])
  content     Json                                 // single TipTap doc
  wordCount   Int           @default(0)
  status      PublishStatus @default(draft)
  createdById String?
  createdBy   User?         @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  @@index([status])
}

// Chapter.workId → bookId (+ relation `book`); ReadEvent.workId → bookId (+ relation `book`).
// User.works → books, plus a new `articles Article[]` back‑relation. Page unchanged.
```

**Out of scope for v1 (deferred):** article read‑analytics (`ReadEvent` stays book‑only; the one
article is a draft, no published articles exist); content versioning (separate initiative).

## Slug rules (defaults)

`slugify(title)` = lowercased, non‑alphanumerics → `-`, collapsed/trimmed (~80 chars). Unique per
table; collisions get a numeric suffix. `Book.slug` is nullable‑unique (Postgres allows many NULLs)
and backfilled. **Frozen on create** (not regenerated on rename) so links don't break; editor exposes
an optional manual override.

## Migration (hand‑authored — a naive Prisma rename DROP/CREATEs and loses data)

A model rename is undetectable by Prisma migrate; left alone it emits `DROP TABLE "Work"` +
`CREATE TABLE "Book"` → **data loss**. So the migration is hand‑written with `ALTER … RENAME`, and the
data move precedes the destructive `kind` drop. Generated via `migrate dev --create-only`, the SQL
replaced wholesale, validated by re‑running `migrate dev` until **drift‑free**. Steps:

1. `CREATE TABLE "Article"` (+ `Article_slug_key`, `Article_status_idx`, `Article_createdById_fkey`).
2. `ALTER TABLE "Work" RENAME TO "Book"`; rename pkey/fkey/indexes to Prisma's `Book_*` names; add
   `Book.slug` (nullable) + `Book_slug_key`. `Chapter."workId"→"bookId"` and `ReadEvent."workId"→"bookId"`
   with their fkey/index renames.
3. **Data:** `INSERT INTO "Article"` from each `kind='article'` book's single page (`content`,
   `wordCount`) + metadata, `slug = slugify(title)`; then `DELETE` those books (cascade drops their
   chapter/page/read rows). **1 row today.**
4. **Backfill** `Book.slug` for the 4 books (`slugify(title)`, de‑duped).
5. `DROP INDEX "Work_kind_idx"` → `ALTER TABLE "Book" DROP COLUMN "kind"` → `DROP TYPE "WorkKind"`.
6. **Scopes:** `UPDATE "ApiKey" SET scopes = …` rewriting `works:write|publish|delete` →
   `content:write|publish|delete`.

Verified by row counts (4 books each with a slug; 1 Article with the right content) and
`prisma migrate status` reporting in‑sync. Applied in Docker by the existing `app-init`
`migrate deploy`.

## Ripple (in scope — the decoupling + rename)

| Layer | Change |
| --- | --- |
| **shared** | New `article.ts` (`articleSummary`/`articleDetail` w/ content, `createArticleInput`, `updateArticleInput`, `articlesQuery`, slug). `work.ts`→`book.ts`: `Work*`→`Book*` types, drop `workKindSchema` + `kind`, add `slug`; `chapterSchema.workId`→`bookId`. `api-key.ts`: scope enum → `content:*`. Re‑export from `index.ts`. |
| **api** | `works` module → `books` (routes `/books`, `prisma.book`). New `articles` module mirroring the scope decorators. CRUD: list, create→draft, detail by **id or slug**, update (metadata+`content`; publish via `status`→`content:publish`), remove (`content:delete`). `scope.guard.ts`: constants→`content:*`, clause‑6 route matching `/works/`→`/books/` **and add `/articles/`** (`prisma.article`). `skeletons.ts`: book‑only (drop article branch). Rename `Chapter.workId`→`bookId` usages, `prisma.work`→`prisma.book`. |
| **mcp** | `create_book`/`list_books`/`get_book`/`update_book` (was `*_work`); new `create_article`/`list_articles`/`get_article`/`update_article` (no publish/status/delete). api‑client routes `/works`→`/books` + `/articles`. README. |
| **web** | Dedicated **article editor** (one TipTap surface, no chapter sidebar), article settings (no buy‑link/chapters; add slug), article **reader** route, library cards/links. Remove `kind` crutches (`EditorPage`/`WorkSettings`→`BookSettings`/`Sidebar`/`Library`/`ReaderPage`). Routes `/works`→`/books`, add `/articles`, `/articles/$id`. `api.ts`: `worksApi`→`booksApi` (`/books`) + new `articlesApi`. |
| **extractor** | Write `Book` (no `kind`). If IR `kind==='article'`, flatten its chapter pages into one `Article.content`. |

## Risks / mitigations

- **Data‑loss on rename** → hand‑authored `ALTER … RENAME`; data move before `kind` drop; row‑count verify.
- **Prisma drift** after hand SQL → re‑run `migrate dev` until "in sync"; index/constraint names match Prisma's `Book_*`/`*_bookId_*` convention.
- **Mobile app** calls `/works` → it must update to `/books` (the user accepted this; out‑of‑repo).
- **Existing MCP key** → scope rewritten in‑place (`content:write`); still draft‑only, still 403s publish/delete.
- **Stack is red mid‑refactor** (DB renamed before code) — expected; green after the workflow + a Docker rebuild.

## Verification

4 books intact + slugged; the migrated article renders as an `Article`; MCP `create_article` → draft;
`publish`/`delete` 403 on the draft key; web article editor/reader work; `pnpm typecheck` green across
all packages; `prisma migrate status` in‑sync.
