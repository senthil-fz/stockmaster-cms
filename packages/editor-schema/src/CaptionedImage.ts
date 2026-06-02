import { Node, mergeAttributes } from '@tiptap/core';

export type ImageAlign = 'full' | 'left';

/** A figure with an image + caption. All fields are attributes (atom block); the panel edits them. */
export const CaptionedImage = Node.create({
  name: 'captionedImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      caption: { default: '' },
      align: { default: 'full' as ImageAlign },
      label: { default: 'image' },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="captioned-image"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'captioned-image' })];
  },
});
