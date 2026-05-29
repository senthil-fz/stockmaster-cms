import { z } from 'zod';

/**
 * The page body is a single Tiptap (ProseMirror) document — "blocks ARE the JSON
 * source of truth". We don't deeply validate the whole ProseMirror tree (Tiptap
 * owns its schema); we validate the shape just enough to reject garbage on the wire.
 */

export type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

export type TiptapDoc = {
  type: 'doc';
  content?: TiptapNode[];
};

const tiptapMarkSchema: z.ZodType<TiptapMark> = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

export const tiptapNodeSchema: z.ZodType<TiptapNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(tiptapNodeSchema).optional(),
    marks: z.array(tiptapMarkSchema).optional(),
    text: z.string().optional(),
  }),
);

export const tiptapDocSchema: z.ZodType<TiptapDoc> = z.object({
  type: z.literal('doc'),
  content: z.array(tiptapNodeSchema).optional(),
});

/** A blank page body: one empty paragraph (matches Tiptap's default). */
export const emptyDoc: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/** A fresh blank document (new object each call — safe to persist). */
export function blankDoc(): TiptapDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** A starter page body with an H1 title block + empty paragraph. */
export function starterDoc(headingText = ''): TiptapDoc {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: headingText ? [{ type: 'text', text: headingText }] : [] },
      { type: 'paragraph' },
    ],
  };
}
