import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutTone = 'info' | 'neutral' | 'warn' | 'success';

/** A highlighted note block. Tone + icon are attributes; the body is editable inline text. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'info' as CalloutTone,
        parseHTML: (el) => (el.getAttribute('data-tone') as CalloutTone) ?? 'info',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone }),
      },
      icon: {
        default: 'Callout',
        parseHTML: (el) => el.getAttribute('data-icon') ?? 'Callout',
        renderHTML: (attrs) => ({ 'data-icon': attrs.icon }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },
});
