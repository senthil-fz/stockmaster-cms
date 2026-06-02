import { Node, mergeAttributes } from '@tiptap/core';

export type DividerVariant = 'line' | 'dots';

/** A visual break — a line rule or a centered dot motif. */
export const Divider = Node.create({
  name: 'divider',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      variant: {
        default: 'line' as DividerVariant,
        parseHTML: (el) => (el.getAttribute('data-variant') as DividerVariant) ?? 'line',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="divider"]' }, { tag: 'hr' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'divider' })];
  },
});
