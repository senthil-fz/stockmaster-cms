// Spec lives in @stockmaster/editor-schema; this file only re-attaches the React NodeView.
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Divider as DividerBase, type DividerVariant } from '@stockmaster/editor-schema';

export const Divider = DividerBase.extend({
  addNodeView: () => ReactNodeViewRenderer(DividerView),
});

function DividerView({ node }: NodeViewProps) {
  const variant = (node.attrs.variant as DividerVariant) ?? 'line';
  return (
    <NodeViewWrapper className={'b-divider' + (variant === 'dots' ? ' dots' : '')} data-drag-handle>
      <div contentEditable={false}>{variant === 'dots' ? '• • •' : <hr />}</div>
    </NodeViewWrapper>
  );
}
