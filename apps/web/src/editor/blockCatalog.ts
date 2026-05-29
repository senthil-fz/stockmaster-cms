import type { Editor, Range } from '@tiptap/core';
import type { IconName } from '../components/icons';

export interface BlockCatalogItem {
  key: string;
  title: string;
  desc: string;
  icon: IconName;
  keywords: string;
  /** Run from the slash menu: `range` covers the "/query" text to delete first. */
  command: (editor: Editor, range: Range) => void;
}

const del = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const BLOCK_CATALOG: BlockCatalogItem[] = [
  {
    key: 'h1',
    title: 'Heading 1',
    desc: 'Large section title',
    icon: 'Heading',
    keywords: 'h1 title big heading',
    command: (e, r) => del(e, r).setNode('heading', { level: 1 }).run(),
  },
  {
    key: 'h2',
    title: 'Heading 2',
    desc: 'Medium subsection',
    icon: 'Heading',
    keywords: 'h2 subtitle heading',
    command: (e, r) => del(e, r).setNode('heading', { level: 2 }).run(),
  },
  {
    key: 'h3',
    title: 'Heading 3',
    desc: 'Small subsection',
    icon: 'Heading',
    keywords: 'h3 heading',
    command: (e, r) => del(e, r).setNode('heading', { level: 3 }).run(),
  },
  {
    key: 'paragraph',
    title: 'Text',
    desc: 'Plain paragraph',
    icon: 'Text',
    keywords: 'paragraph body p text',
    command: (e, r) => del(e, r).setNode('paragraph').run(),
  },
  {
    key: 'bulletList',
    title: 'Bulleted list',
    desc: 'Unordered items',
    icon: 'ListBullet',
    keywords: 'ul bullet unordered list',
    command: (e, r) => del(e, r).toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    title: 'Numbered list',
    desc: 'Ordered steps',
    icon: 'ListNumber',
    keywords: 'ol ordered steps numbered list',
    command: (e, r) => del(e, r).toggleOrderedList().run(),
  },
  {
    key: 'quote',
    title: 'Quote',
    desc: 'Pull quote with citation',
    icon: 'Quote',
    keywords: 'blockquote pull quote',
    command: (e, r) => del(e, r).setNode('quote').run(),
  },
  {
    key: 'callout',
    title: 'Callout',
    desc: 'Highlighted note',
    icon: 'Callout',
    keywords: 'note info admonition callout',
    command: (e, r) => del(e, r).setNode('callout', { tone: 'info', icon: 'Callout' }).run(),
  },
  {
    key: 'image',
    title: 'Image',
    desc: 'Photo or figure',
    icon: 'Image',
    keywords: 'photo figure picture image',
    command: (e, r) => del(e, r).insertContent({ type: 'captionedImage' }).run(),
  },
  {
    key: 'table',
    title: 'Table',
    desc: 'Rows and columns',
    icon: 'Table',
    keywords: 'grid data table',
    command: (e, r) =>
      del(e, r)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    key: 'divider',
    title: 'Divider',
    desc: 'Visual break',
    icon: 'Divider',
    keywords: 'hr rule separator divider',
    command: (e, r) => del(e, r).insertContent({ type: 'divider' }).run(),
  },
];

export function filterCatalog(query: string): BlockCatalogItem[] {
  if (!query) return BLOCK_CATALOG;
  const q = query.toLowerCase();
  return BLOCK_CATALOG.filter((it) => (it.title + ' ' + it.keywords).toLowerCase().includes(q));
}
