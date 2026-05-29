import { useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { MAX_UPLOAD_BYTES } from '@blockpress/shared';
import { uploadsApi } from '../../lib/api';

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

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

function ImageView({ node, updateAttributes, editor }: NodeViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { src, caption, align, label } = node.attrs as {
    src: string;
    caption: string;
    align: ImageAlign;
    label: string;
  };

  const upload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      window.alert('Image is too large (max 15MB).');
      return;
    }
    const contentType = file.type || 'application/octet-stream';
    const { uploadUrl, publicUrl } = await uploadsApi.presign({
      filename: file.name,
      contentType,
      size: file.size,
    });
    await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
    updateAttributes({ src: publicUrl });
  };

  return (
    <NodeViewWrapper className={'b-image align-' + align} data-drag-handle>
      <figure>
        {src ? (
          <img
            src={src}
            alt={caption || ''}
            onClick={() => editor.isEditable && inputRef.current?.click()}
            style={{ cursor: editor.isEditable ? 'pointer' : 'default' }}
          />
        ) : (
          <div
            className="ph"
            role="button"
            onClick={() => editor.isEditable && inputRef.current?.click()}
            contentEditable={false}
          >
            <span className="label">click to upload an image ‹ {label} ›</span>
          </div>
        )}
        {caption && <figcaption contentEditable={false}>{caption}</figcaption>}
      </figure>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </NodeViewWrapper>
  );
}
