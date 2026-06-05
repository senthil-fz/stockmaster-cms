// Spec lives in @stockmaster/editor-schema; this file only re-attaches the React NodeView.
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Quote as QuoteBase } from '@stockmaster/editor-schema';

export const Quote = QuoteBase.extend({
  addNodeView: () => ReactNodeViewRenderer(QuoteView),
});

function QuoteView({ node }: NodeViewProps) {
  const cite = node.attrs.cite as string;
  return (
    <NodeViewWrapper className="border-l-[3px] border-primary py-0.5 pl-[18px] text-[18px] leading-[1.55] italic text-fg">
      <NodeViewContent />
      {cite && (
        <span
          className="block not-italic text-[13px] text-faint mt-2 font-sans"
          contentEditable={false}
        >
          {cite}
        </span>
      )}
    </NodeViewWrapper>
  );
}
