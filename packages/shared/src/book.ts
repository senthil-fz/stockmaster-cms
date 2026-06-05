import { z } from 'zod';
import { tiptapDocSchema } from './tiptap';

/** Wire enum — lowercase to match the Prisma enum values exactly (no mapping needed). */
export const publishStatusSchema = z.enum(['draft', 'published']);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

/** URL-friendly slug: lowercase letters, digits and single hyphens (shared by books + articles). */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase letters, digits and single hyphens');

/**
 * A URL restricted to the http(s) scheme. z.string().url() alone also accepts
 * `javascript:`/`data:`, which become stored-XSS when rendered into an href, so
 * the scheme is allowlisted server-side here. Exported so articles reuse it.
 */
export const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());
export const httpUrl = z.string().url().max(2000).refine(isHttpUrl, 'Must be an http(s) URL');

// ─── Read models ──────────────────────────────────────────────────────────────

export const pageSummarySchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  title: z.string(),
  status: publishStatusSchema,
  order: z.number().int(),
  wordCount: z.number().int(),
  updatedAt: z.string(),
});
export type PageSummary = z.infer<typeof pageSummarySchema>;

export const pageSchema = pageSummarySchema.extend({
  content: tiptapDocSchema,
});
export type Page = z.infer<typeof pageSchema>;

export const chapterSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  title: z.string(),
  order: z.number().int(),
  pages: z.array(pageSummarySchema),
});
export type Chapter = z.infer<typeof chapterSchema>;

export const bookSummarySchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  subtitle: z.string(),
  author: z.string(),
  year: z.string(),
  coverTone: z.string(),
  coverUrl: z.string().nullable(),
  /** External purchase URL (books only). */
  buyLink: z.string().nullable(),
  /** Derived from `publishedVersionId` (published when a live version exists, else draft). */
  status: publishStatusSchema,
  /** True when the published book has draft edits not yet captured in a new version. */
  hasUnpublishedChanges: z.boolean(),
  tags: z.array(z.string()),
  pageCount: z.number().int(),
  wordCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BookSummary = z.infer<typeof bookSummarySchema>;

export const bookDetailSchema = bookSummarySchema.extend({
  chapters: z.array(chapterSchema),
});
export type BookDetail = z.infer<typeof bookDetailSchema>;

// ─── Write models (request DTOs) ────────────────────────────────────────────────

export const createBookSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

export const updateBookSchema = z
  .object({
    title: z.string().min(1).max(200),
    subtitle: z.string().max(300),
    author: z.string().max(120),
    year: z.string().max(12),
    coverTone: z.string().max(40),
    coverUrl: httpUrl.nullable(),
    buyLink: httpUrl.nullable(),
    slug: slugSchema,
    // `status` is no longer writable — visibility changes only through publish/unpublish.
    tags: z.array(z.string().max(40)).max(20),
  })
  .partial();
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

export const createChapterSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type CreateChapterInput = z.infer<typeof createChapterSchema>;

export const updateChapterSchema = z
  .object({
    title: z.string().min(1).max(200),
    order: z.number().int().min(0),
  })
  .partial();
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;

export const createPageSchema = z.object({
  title: z.string().max(200).optional(),
});
export type CreatePageInput = z.infer<typeof createPageSchema>;

export const updatePageSchema = z
  .object({
    title: z.string().max(200),
    content: tiptapDocSchema,
    status: publishStatusSchema,
    order: z.number().int().min(0),
  })
  .partial();
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

/** Reorder a list of sibling entities (chapters within a book, pages within a chapter). */
export const reorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});
export type ReorderInput = z.infer<typeof reorderSchema>;

export const booksQuerySchema = z.object({
  status: publishStatusSchema.optional(),
});
export type BooksQuery = z.infer<typeof booksQuerySchema>;
