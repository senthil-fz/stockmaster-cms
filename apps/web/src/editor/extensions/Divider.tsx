// Spec lives in @stockmaster/editor-schema; this file only re-attaches the React NodeView.
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Divider as DividerBase, type DividerVariant } from '@stockmaster/editor-schema';

export const Divider = DividerBase.extend({
  addNodeView: () => ReactNodeViewRenderer(DividerView),
});

function DividerView({ node }: NodeViewProps) {
  const variant = (node.attrs.variant as DividerVariant) ?? 'line';
  return (
    <NodeViewWrapper
      className={
        'py-[14px]' +
        (variant === 'dots' ? ' text-center text-faint tracking-[0.5em]' : '')
      }
      data-drag-handle
    >
      <div contentEditable={false}>
        {variant === 'dots' ? '• • •' : <hr className="border-0 border-t border-solid border-line-strong m-0" />}
      </div>
    </NodeViewWrapper>
  );
}
