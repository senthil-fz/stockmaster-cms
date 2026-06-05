import { z } from 'zod';
import { tiptapDocSchema } from './tiptap';

/**
 * Immutable content snapshots — the published-version / working-draft split.
 *
 * A snapshot is a self-contained, already-filtered, already-ordered reading structure
 * (NOT raw Prisma rows): only published pages, in reading order, with real page ids
 * preserved. These blobs must stay readable years from now, independent of the live
 * tree, so they carry `schemaVersion` on the envelope (the version ROW, not the blob).
 *
 * The shape defined here is the single contract: the migration backfill SQL, the runtime
 * snapshot builders (`apps/api/src/common/versioning/snapshot.ts`), and the reader all
 * produce / consume exactly this shape.
 */

/** Current snapshot envelope version. Bump only on a breaking shape change. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

// ─── Book snapshot ──────────────────────────────────────────────────────────────

/** Frozen book metadata carried in the snapshot (subset of the live Book scalars). */
export const bookSnapshotMetaSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  author: z.string(),
  year: z.string(),
  coverTone: z.string(),
  coverUrl: z.string().nullable(),
  /** External purchase URL (books only). */
  buyLink: z.string().nullable(),
  tags: z.array(z.string()),
  slug: z.string().nullable(),
});
export type BookSnapshotMeta = z.infer<typeof bookSnapshotMetaSchema>;

/** A single page within a snapshot chapter. `id` is the real live Page.id, preserved. */
export const snapshotPageSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
  wordCount: z.number().int(),
  content: tiptapDocSchema,
});
export type SnapshotPage = z.infer<typeof snapshotPageSchema>;

/** A chapter within a snapshot. Only chapters with ≥1 published page are captured. */
export const snapshotChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
  pages: z.array(snapshotPageSchema),
});
export type SnapshotChapter = z.infer<typeof snapshotChapterSchema>;

export const bookSnapshotSchema = z.object({
  book: bookSnapshotMetaSchema,
  chapters: z.array(snapshotChapterSchema),
});
export type BookSnapshot = z.infer<typeof bookSnapshotSchema>;

// ─── Article snapshot ─────────────────────────────────────────────────────────────

/** Frozen article metadata carried in the snapshot (subset of the live Article scalars). */
export const articleSnapshotMetaSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  author: z.string(),
  year: z.string(),
  coverTone: z.string(),
  coverUrl: z.string().nullable(),
  tags: z.array(z.string()),
  slug: z.string(),
});
export type ArticleSnapshotMeta = z.infer<typeof articleSnapshotMetaSchema>;

export const articleSnapshotSchema = z.object({
  article: articleSnapshotMetaSchema,
  content: tiptapDocSchema,
  wordCount: z.number().int(),
});
export type ArticleSnapshot = z.infer<typeof articleSnapshotSchema>;

// ─── Version summary (history list — metadata only, no full snapshot) ───────────────

export const versionSummarySchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  schemaVersion: z.number().int(),
  wordCount: z.number().int(),
  /** Books only; articles omit it (single page). */
  pageCount: z.number().int().optional(),
  note: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  /** True when this version is the one currently served to the public. */
  isPublished: z.boolean(),
});
export type VersionSummary = z.infer<typeof versionSummarySchema>;
