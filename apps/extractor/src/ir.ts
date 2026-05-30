import { z } from 'zod';

/**
 * Intermediate Representation (IR) for an extracted document.
 *
 * This is the app-agnostic contract between the Python extractor (which produces
 * a `book.json`) and the TS ingester (which converts it to Tiptap + writes the DB).
 * Keeping it a small, explicit block vocabulary makes the pipeline reusable for any
 * source document, not just this book.
 */

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: z.string() }),
  z.object({ type: z.literal('bulletList'), items: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('orderedList'), items: z.array(z.string()).min(1), start: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal('quote'), text: z.string(), cite: z.string().default('') }),
  z.object({
    type: z.literal('callout'),
    tone: z.string().default('neutral'),
    icon: z.string().default('Pin'),
    text: z.string(),
  }),
  z.object({ type: z.literal('divider'), variant: z.string().default('line') }),
]);
export type Block = z.infer<typeof blockSchema>;

export const sectionSchema = z.object({
  title: z.string(),
  status: z.enum(['draft', 'published']).default('published'),
  blocks: z.array(blockSchema),
});
export type SectionIR = z.infer<typeof sectionSchema>;

export const chapterSchema = z.object({
  title: z.string(),
  sections: z.array(sectionSchema).min(1),
});
export type ChapterIR = z.infer<typeof chapterSchema>;

export const bookSchema = z.object({
  work: z.object({
    kind: z.enum(['book', 'article']).default('book'),
    title: z.string().min(1),
    subtitle: z.string().default(''),
    author: z.string().default(''),
    year: z.string().default(''),
    tags: z.array(z.string()).default([]),
    coverTone: z.string().default('default'),
    status: z.enum(['draft', 'published']).default('published'),
  }),
  chapters: z.array(chapterSchema).min(1),
});
export type BookIR = z.infer<typeof bookSchema>;
