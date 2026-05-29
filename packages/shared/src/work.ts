import { z } from 'zod';
import { tiptapDocSchema } from './tiptap';

/** Wire enums — lowercase to match Prisma enum values exactly (no mapping needed). */
export const workKindSchema = z.enum(['book', 'article']);
export type WorkKind = z.infer<typeof workKindSchema>;

export const publishStatusSchema = z.enum(['draft', 'published']);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

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
  workId: z.string(),
  title: z.string(),
  order: z.number().int(),
  pages: z.array(pageSummarySchema),
});
export type Chapter = z.infer<typeof chapterSchema>;

export const workSummarySchema = z.object({
  id: z.string(),
  kind: workKindSchema,
  title: z.string(),
  subtitle: z.string(),
  author: z.string(),
  year: z.string(),
  coverTone: z.string(),
  coverUrl: z.string().nullable(),
  status: publishStatusSchema,
  tags: z.array(z.string()),
  pageCount: z.number().int(),
  wordCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkSummary = z.infer<typeof workSummarySchema>;

export const workDetailSchema = workSummarySchema.extend({
  chapters: z.array(chapterSchema),
});
export type WorkDetail = z.infer<typeof workDetailSchema>;

// ─── Write models (request DTOs) ────────────────────────────────────────────────

export const createWorkSchema = z.object({
  kind: workKindSchema,
  title: z.string().min(1).max(200).optional(),
});
export type CreateWorkInput = z.infer<typeof createWorkSchema>;

export const updateWorkSchema = z
  .object({
    title: z.string().min(1).max(200),
    subtitle: z.string().max(300),
    author: z.string().max(120),
    year: z.string().max(12),
    coverTone: z.string().max(40),
    coverUrl: z.string().url().nullable(),
    status: publishStatusSchema,
    tags: z.array(z.string().max(40)).max(20),
  })
  .partial();
export type UpdateWorkInput = z.infer<typeof updateWorkSchema>;

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

/** Reorder a list of sibling entities (chapters within a work, pages within a chapter). */
export const reorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});
export type ReorderInput = z.infer<typeof reorderSchema>;

export const worksQuerySchema = z.object({
  kind: workKindSchema.optional(),
  status: publishStatusSchema.optional(),
});
export type WorksQuery = z.infer<typeof worksQuerySchema>;
