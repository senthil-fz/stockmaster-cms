-- Content versioning — published-version / working-draft split (behavior-preserving).
--
-- The live Book → Chapter → Page tree (and Article.content) stays the editable working
-- draft. A new immutable BookVersion / ArticleVersion row stores a self-contained JSON
-- snapshot at publish time, and Book/Article.publishedVersionId points at the one live
-- version. `publishedVersionId != null` becomes the sole source of truth for "publicly
-- visible", so the derived `status` column is dropped (Page.status stays — it is the
-- editorial "include this page on publish" staging flag).
--
-- Hand-authored (Prisma can't generate the backfill). Steps, in dependency order:
--   1. CREATE the two version tables + indexes.
--   2. ALTER Book/Article: ADD publishedVersionId (nullable unique FK) + draftDirty.
--   3. BACKFILL one versionNumber=1 snapshot for every previously-published entity and
--      set the pointer (drafts get a null pointer — correctly not public).
--   4. DROP Book.status / Article.status (+ their indexes).
-- The circular FK (BookVersion.bookId → Book, Book.publishedVersionId → BookVersion) is
-- safe because the pointer is added/backfilled only after both tables exist.

-- ── 1. Version tables (immutable snapshots) ───────────────────────────────────────────
CREATE TABLE "BookVersion" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookVersion_bookId_createdAt_idx" ON "BookVersion"("bookId", "createdAt");
CREATE UNIQUE INDEX "BookVersion_bookId_versionNumber_key" ON "BookVersion"("bookId", "versionNumber");
ALTER TABLE "BookVersion" ADD CONSTRAINT "BookVersion_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookVersion" ADD CONSTRAINT "BookVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleVersion_articleId_createdAt_idx" ON "ArticleVersion"("articleId", "createdAt");
CREATE UNIQUE INDEX "ArticleVersion_articleId_versionNumber_key" ON "ArticleVersion"("articleId", "versionNumber");
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Published pointer + dirty flag on Book / Article ────────────────────────────────
ALTER TABLE "Book" ADD COLUMN "publishedVersionId" TEXT;
ALTER TABLE "Book" ADD COLUMN "draftDirty" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Book_publishedVersionId_key" ON "Book"("publishedVersionId");
ALTER TABLE "Book" ADD CONSTRAINT "Book_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "BookVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Article" ADD COLUMN "publishedVersionId" TEXT;
ALTER TABLE "Article" ADD COLUMN "draftDirty" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Article_publishedVersionId_key" ON "Article"("publishedVersionId");
ALTER TABLE "Article" ADD CONSTRAINT "Article_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "ArticleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3a. Backfill: one v1 BookVersion per previously-published book ─────────────────────
-- The snapshot stores the already-filtered, already-ordered reading structure (the exact
-- thing readers see today): only status='published' pages, in (chapter.order, page.order)
-- order, with their real page ids preserved. Chapters with no published page are dropped.
-- Built bottom-up: pages → chapters → book, matching the snapshot.ts builder shape exactly.
WITH "published_book" AS (
    SELECT "id" FROM "Book" WHERE "status" = 'published'
),
"book_chapter" AS (
    SELECT
        c."bookId",
        c."id"    AS "chapterId",
        c."title" AS "chapterTitle",
        c."order" AS "chapterOrder",
        jsonb_agg(
            jsonb_build_object(
                'id',        p."id",
                'title',     p."title",
                'order',     p."order",
                'wordCount', p."wordCount",
                'content',   p."content"
            )
            ORDER BY p."order", p."id"
        ) AS "pages",
        COUNT(p."id")            AS "pageCount",
        COALESCE(SUM(p."wordCount"), 0) AS "wordCount"
    FROM "Chapter" c
    JOIN "published_book" pb ON pb."id" = c."bookId"
    -- INNER JOIN on published pages drops chapters with zero published pages.
    JOIN "Page" p ON p."chapterId" = c."id" AND p."status" = 'published'
    GROUP BY c."bookId", c."id", c."title", c."order"
),
"book_snapshot" AS (
    SELECT
        b."id" AS "bookId",
        jsonb_build_object(
            'book', jsonb_build_object(
                'title',     b."title",
                'subtitle',  b."subtitle",
                'author',    b."author",
                'year',      b."year",
                'coverTone', b."coverTone",
                'coverUrl',  b."coverUrl",
                'buyLink',   b."buyLink",
                'tags',      to_jsonb(b."tags"),
                'slug',      b."slug"
            ),
            'chapters', COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id',    bc."chapterId",
                        'title', bc."chapterTitle",
                        'order', bc."chapterOrder",
                        'pages', bc."pages"
                    )
                    ORDER BY bc."chapterOrder", bc."chapterId"
                ) FILTER (WHERE bc."chapterId" IS NOT NULL),
                '[]'::jsonb
            )
        ) AS "snapshot",
        COALESCE(SUM(bc."pageCount"), 0)::int AS "pageCount",
        COALESCE(SUM(bc."wordCount"), 0)::int AS "wordCount"
    FROM "Book" b
    JOIN "published_book" pb ON pb."id" = b."id"
    LEFT JOIN "book_chapter" bc ON bc."bookId" = b."id"
    GROUP BY b."id", b."title", b."subtitle", b."author", b."year",
             b."coverTone", b."coverUrl", b."buyLink", b."tags", b."slug"
),
"inserted_version" AS (
    INSERT INTO "BookVersion" (
        "id", "bookId", "versionNumber", "snapshot", "schemaVersion",
        "wordCount", "pageCount", "note", "createdById", "createdAt"
    )
    SELECT
        gen_random_uuid()::text,
        bs."bookId",
        1,
        bs."snapshot",
        1,
        bs."wordCount",
        bs."pageCount",
        NULL,
        NULL,
        CURRENT_TIMESTAMP
    FROM "book_snapshot" bs
    RETURNING "id", "bookId"
)
UPDATE "Book" b
SET "publishedVersionId" = iv."id"
FROM "inserted_version" iv
WHERE iv."bookId" = b."id";

-- ── 3b. Backfill: one v1 ArticleVersion per previously-published article ───────────────
-- Snapshot = article metadata + content + wordCount.
WITH "article_snapshot" AS (
    SELECT
        a."id" AS "articleId",
        jsonb_build_object(
            'article', jsonb_build_object(
                'title',     a."title",
                'subtitle',  a."subtitle",
                'author',    a."author",
                'year',      a."year",
                'coverTone', a."coverTone",
                'coverUrl',  a."coverUrl",
                'tags',      to_jsonb(a."tags"),
                'slug',      a."slug"
            ),
            'content',   a."content",
            'wordCount', a."wordCount"
        ) AS "snapshot",
        a."wordCount"
    FROM "Article" a
    WHERE a."status" = 'published'
),
"inserted_version" AS (
    INSERT INTO "ArticleVersion" (
        "id", "articleId", "versionNumber", "snapshot", "schemaVersion",
        "wordCount", "note", "createdById", "createdAt"
    )
    SELECT
        gen_random_uuid()::text,
        s."articleId",
        1,
        s."snapshot",
        1,
        s."wordCount",
        NULL,
        NULL,
        CURRENT_TIMESTAMP
    FROM "article_snapshot" s
    RETURNING "id", "articleId"
)
UPDATE "Article" a
SET "publishedVersionId" = iv."id"
FROM "inserted_version" iv
WHERE iv."articleId" = a."id";

-- ── 4. Drop the now-derived status columns (Page.status STAYS) ─────────────────────────
DROP INDEX "Book_status_idx";
ALTER TABLE "Book" DROP COLUMN "status";

DROP INDEX "Article_status_idx";
ALTER TABLE "Article" DROP COLUMN "status";
