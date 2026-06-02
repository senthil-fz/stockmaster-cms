// Spec lives in @blockpress/editor-schema; this file only re-attaches the React NodeView.
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Quote as QuoteBase } from '@blockpress/editor-schema';

export const Quote = QuoteBase.extend({
  addNodeView: () => ReactNodeViewRenderer(QuoteView),
});

function QuoteView({ node }: NodeViewProps) {
  const cite = node.attrs.cite as string;
  return (
    <NodeViewWrapper className="b-quote">
      <NodeViewContent />
      {cite && (
        <span className="cite" contentEditable={false}>
          {cite}
        </span>
      )}
    </NodeViewWrapper>
  );
}
