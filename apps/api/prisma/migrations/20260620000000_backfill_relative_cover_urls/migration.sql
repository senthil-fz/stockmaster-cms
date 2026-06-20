-- Backfill existing covers to domain-free paths (data-only, no schema change).
--
-- Covers used to be persisted as ABSOLUTE urls (e.g. https://api.laabam.in/uploads/x.jpg),
-- freezing the API domain into every row. We now store the RELATIVE "/uploads/..." path and
-- attach the current origin on read (see apps/api/src/common/media/cover-url.ts). New writes
-- already strip the domain; this one-time pass cleans the rows written before that change.
--
-- Strips only the "scheme://host" prefix of URLs whose path is under /uploads/ — so legacy
-- AND current hosts collapse to the same relative path. Idempotent: already-relative covers
-- and externally hosted (non-/uploads) URLs don't match the WHERE and are left untouched.
-- Immutable publish snapshots are deliberately NOT touched; they are rebased on read.

UPDATE "Article"
SET "coverUrl" = regexp_replace("coverUrl", '^https?://[^/]+(/uploads/.*)$', '\1')
WHERE "coverUrl" ~ '^https?://[^/]+/uploads/';

UPDATE "Book"
SET "coverUrl" = regexp_replace("coverUrl", '^https?://[^/]+(/uploads/.*)$', '\1')
WHERE "coverUrl" ~ '^https?://[^/]+/uploads/';
