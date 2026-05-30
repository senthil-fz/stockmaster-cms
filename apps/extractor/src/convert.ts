import type { TiptapDoc, TiptapNode } from '@blockpress/shared';
import type { Block } from './ir';

/**
 * Convert IR blocks → a Tiptap document, using the SAME node shapes the app's
 * editor schema expects (see apps/web/src/editor/useBlockEditor.ts). Notably the
 * app disables StarterKit's `blockquote`/`horizontalRule` in favour of custom
 * `quote`/`divider` nodes — so we emit those, never `blockquote`.
 */

/** Minimal inline parser: **bold** and *italic* / _italic_ → Tiptap marks. */
export function inline(text: string): TiptapNode[] {
  if (!text) return [];
  const nodes: TiptapNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
    const bold = m[2];
    const italic = m[3] ?? m[4];
    if (bold !== undefined) nodes.push({ type: 'text', text: bold, marks: [{ type: 'bold' }] });
    else if (italic !== undefined) nodes.push({ type: 'text', text: italic, marks: [{ type: 'italic' }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}

const para = (t: string): TiptapNode => ({ type: 'paragraph', content: inline(t) });
const heading = (level: number, t: string): TiptapNode => ({
  type: 'heading',
  attrs: { level },
  content: inline(t),
});
const listItem = (t: string): TiptapNode => ({ type: 'listItem', content: [para(t)] });

export function blockToNode(b: Block): TiptapNode {
  switch (b.type) {
    case 'paragraph':
      return para(b.text);
    case 'heading':
      return heading(b.level, b.text);
    case 'bulletList':
      return { type: 'bulletList', content: b.items.map(listItem) };
    case 'orderedList':
      return { type: 'orderedList', content: b.items.map(listItem) };
    case 'quote':
      return { type: 'quote', attrs: { cite: b.cite }, content: inline(b.text) };
    case 'callout':
      return { type: 'callout', attrs: { tone: b.tone, icon: b.icon }, content: inline(b.text) };
    case 'divider':
      return { type: 'divider', attrs: { variant: b.variant } };
  }
}

/** Build a full Tiptap doc. Never empty — a blank page gets one empty paragraph. */
export function blocksToDoc(blocks: Block[]): TiptapDoc {
  const content = blocks.map(blockToNode);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
