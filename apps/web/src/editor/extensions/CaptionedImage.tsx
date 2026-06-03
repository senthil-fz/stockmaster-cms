// Spec lives in @stockmaster/editor-schema; this file only re-attaches the React NodeView.
import { useRef, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { CaptionedImage as CaptionedImageBase, type ImageAlign } from '@stockmaster/editor-schema';
import { IMAGE_TYPE_MESSAGE, MAX_UPLOAD_BYTES, isAllowedImageType } from '@stockmaster/shared';
import { uploadsApi } from '../../lib/api';

export const CaptionedImage = CaptionedImageBase.extend({
  addNodeView: () => ReactNodeViewRenderer(ImageView),
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
      const { url } = await uploadsApi.upload(file);
      updateAttributes({ src: url }); // only set src on a confirmed-ok upload
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
