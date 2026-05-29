import type { TiptapDoc, TiptapNode } from './tiptap';

/**
 * Count words in a Tiptap document. Used by BOTH the client (live page stats)
 * and the server (persisting `Page.wordCount` so the library list never has to
 * load full page content). Walks every text node and counts whitespace-split tokens.
 */
export function countWordsInDoc(doc: TiptapDoc | null | undefined): number {
  if (!doc?.content) return 0;
  let words = 0;
  const walk = (node: TiptapNode): void => {
    if (typeof node.text === 'string') {
      const trimmed = node.text.trim();
      if (trimmed) words += trimmed.split(/\s+/).length;
    }
    node.content?.forEach(walk);
  };
  doc.content.forEach(walk);
  return words;
}

/** Estimated reading time in minutes (≈220 wpm), floored at 1. */
export function readingTimeMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 220));
}
