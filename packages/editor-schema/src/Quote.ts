import { Node, mergeAttributes } from '@tiptap/core';

/** A pull-quote block. The quote text is editable inline; the citation is an attribute (edited in the panel). */
export const Quote = Node.create({
  name: 'quote',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      cite: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-cite') ?? '',
        renderHTML: (attrs) => (attrs.cite ? { 'data-cite': attrs.cite } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'blockquote[data-type="quote"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes, { 'data-type': 'quote' }), 0];
  },
});
