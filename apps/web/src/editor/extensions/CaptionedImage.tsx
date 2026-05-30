import { useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { IMAGE_TYPE_MESSAGE, MAX_UPLOAD_BYTES, isAllowedImageType } from '@blockpress/shared';
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
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const { src, caption, align, label } = node.attrs as {
    src: string;
    caption: string;
    align: ImageAlign;
    label: string;
  };

  const upload = async (file: File) => {
    if (!isAllowedImageType(file.type)) {
      setStatus('error');
      window.alert(IMAGE_TYPE_MESSAGE);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus('error');
      window.alert('Image is too large (max 15MB).');
      return;
    }
    setStatus('uploading');
    try {
      const { uploadUrl, publicUrl } = await uploadsApi.presign({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      updateAttributes({ src: publicUrl }); // only set src on a confirmed-ok upload
      setStatus('idle');
    } catch {
      setStatus('error');
      window.alert('Image upload failed. Please try again.');
    }
  };

  const placeholderLabel =
    status === 'uploading'
      ? 'uploading…'
      : status === 'error'
        ? 'upload failed — click to retry'
        : `click to upload an image ‹ ${label} ›`;

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
            className={'ph' + (status === 'error' ? ' is-error' : '')}
            role="button"
            aria-busy={status === 'uploading'}
            onClick={() => editor.isEditable && status !== 'uploading' && inputRef.current?.click()}
            contentEditable={false}
          >
            <span className="label">{placeholderLabel}</span>
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
