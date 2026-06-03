import { z } from 'zod';
import { tiptapDocSchema } from './tiptap';
import { httpUrl, publishStatusSchema, slugSchema } from './book';

/**
 * An ARTICLE — a single page of content (one TipTap doc), separate from the book
 * Chapter→Page tree. Identified by a native uuid `id` and a unique `slug`.
 */

// ─── Read models ──────────────────────────────────────────────────────────────

export const articleSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  author: z.string(),
  year: z.string(),
  coverTone: z.string(),
  coverUrl: z.string().nullable(),
  status: publishStatusSchema,
  tags: z.array(z.string()),
  wordCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ArticleSummary = z.infer<typeof articleSummarySchema>;

export const articleDetailSchema = articleSummarySchema.extend({
  content: tiptapDocSchema,
});
export type ArticleDetail = z.infer<typeof articleDetailSchema>;

// ─── Write models (request DTOs) ────────────────────────────────────────────────

export const createArticleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z
  .object({
    title: z.string().min(1).max(200),
    subtitle: z.string().max(300),
    author: z.string().max(120),
    year: z.string().max(12),
    coverTone: z.string().max(40),
    coverUrl: httpUrl.nullable(),
    slug: slugSchema,
    content: tiptapDocSchema,
    status: publishStatusSchema,
    tags: z.array(z.string().max(40)).max(20),
  })
  .partial();
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const articlesQuerySchema = z.object({
  status: publishStatusSchema.optional(),
});
export type ArticlesQuery = z.infer<typeof articlesQuerySchema>;
