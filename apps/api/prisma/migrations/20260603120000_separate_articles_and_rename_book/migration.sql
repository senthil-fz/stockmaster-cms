-- Separate Articles from Books + rename Work -> Book (data-preserving).
--
-- Prisma cannot detect renames; an auto-generated migration would DROP "Work" and
-- CREATE "Book" (losing data). This migration is hand-authored: it RENAMEs in place,
-- moves the existing article rows into the new Article table BEFORE dropping `kind`,
-- and backfills slugs. On the (empty) shadow DB the data steps are harmless no-ops, so
-- `migrate dev` drift-detection still sees the canonical end-state.

-- ── 1. New Article table (single-page content; native uuid PK + unique slug) ──────────
CREATE TABLE "Article" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "coverTone" TEXT NOT NULL DEFAULT 'default',
    "coverUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");
CREATE INDEX "Article_status_idx" ON "Article"("status");
ALTER TABLE "Article" ADD CONSTRAINT "Article_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Rename Work -> Book (constraints/indexes follow Prisma's Book_* naming) ─────────
ALTER TABLE "Work" RENAME TO "Book";
ALTER TABLE "Book" RENAME CONSTRAINT "Work_pkey" TO "Book_pkey";                       -- also renames backing index
ALTER TABLE "Book" RENAME CONSTRAINT "Work_createdById_fkey" TO "Book_createdById_fkey";
ALTER INDEX "Work_status_idx" RENAME TO "Book_status_idx";
DROP INDEX "Work_kind_idx";
ALTER TABLE "Book" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Book_slug_key" ON "Book"("slug");

-- ── 3. Rename FK columns workId -> bookId (Chapter, ReadEvent) ─────────────────────────
ALTER TABLE "Chapter" RENAME COLUMN "workId" TO "bookId";
ALTER TABLE "Chapter" RENAME CONSTRAINT "Chapter_workId_fkey" TO "Chapter_bookId_fkey";
ALTER INDEX "Chapter_workId_order_idx" RENAME TO "Chapter_bookId_order_idx";

ALTER TABLE "ReadEvent" RENAME COLUMN "workId" TO "bookId";
ALTER TABLE "ReadEvent" RENAME CONSTRAINT "ReadEvent_workId_fkey" TO "ReadEvent_bookId_fkey";
ALTER INDEX "ReadEvent_workId_createdAt_idx" RENAME TO "ReadEvent_bookId_createdAt_idx";
ALTER INDEX "ReadEvent_workId_userId_idx" RENAME TO "ReadEvent_bookId_userId_idx";

-- ── 4. Move existing articles (kind='article') into Article, then delete those rows ───
-- Each article book today has exactly one chapter + one page; its page content becomes
-- Article.content. (A duplicate slug here would fail loudly rather than corrupt silently.)
INSERT INTO "Article" (
    "id", "slug", "title", "subtitle", "author", "year",
    "coverTone", "coverUrl", "tags", "content", "wordCount",
    "status", "createdById", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(b."title"), '[^a-z0-9]+', '-', 'g')), ''), b."id"),
    b."title", b."subtitle", b."author", b."year",
    b."coverTone", b."coverUrl", b."tags", p."content", p."wordCount",
    b."status", b."createdById", b."createdAt", b."updatedAt"
FROM "Book" b
JOIN "Chapter" c ON c."bookId" = b."id"
JOIN "Page" p ON p."chapterId" = c."id"
WHERE b."kind" = 'article';

DELETE FROM "Book" WHERE "kind" = 'article';   -- cascade drops their chapters/pages/read events

-- ── 5. Backfill slugs for the remaining books (slugify(title); fallback to id) ─────────
UPDATE "Book"
SET "slug" = COALESCE(NULLIF(trim(both '-' from regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')), ''), "id")
WHERE "slug" IS NULL;

-- ── 6. Drop the kind discriminator + enum (Work is always a book now) ─────────────────
ALTER TABLE "Book" DROP COLUMN "kind";
DROP TYPE "WorkKind";

-- ── 7. Rewrite API-key scopes works:* -> content:* (governs books + articles) ─────────
UPDATE "ApiKey"
SET "scopes" = (
    SELECT array_agg(
        CASE s
            WHEN 'works:write'   THEN 'content:write'
            WHEN 'works:publish' THEN 'content:publish'
            WHEN 'works:delete'  THEN 'content:delete'
            ELSE s
        END
        ORDER BY ord
    )
    FROM unnest("scopes") WITH ORDINALITY AS u(s, ord)
)
WHERE "scopes" && ARRAY['works:write', 'works:publish', 'works:delete'];
