// Spec lives in @stockmaster/editor-schema; this file only re-attaches the React NodeView.
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Callout as CalloutBase, type CalloutTone } from '@stockmaster/editor-schema';
import { Icon, type IconName } from '../../components/icons';

export const CALLOUT_ICONS: IconName[] = ['Callout', 'Pin', 'Star', 'Sparkle', 'Check', 'Quote'];

export const Callout = CalloutBase.extend({
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});

function CalloutView({ node }: NodeViewProps) {
  const tone = (node.attrs.tone as CalloutTone) ?? 'info';
  const icon = (node.attrs.icon as IconName) || 'Callout';
  return (
    <NodeViewWrapper className={'b-callout' + (tone !== 'info' ? ` tone-${tone}` : '')}>
      <span className="ico" contentEditable={false}>
        <Icon name={icon} style={{ width: 19, height: 19 }} />
      </span>
      <NodeViewContent className="b-callout-body" />
    </NodeViewWrapper>
  );
}
