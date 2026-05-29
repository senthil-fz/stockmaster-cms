import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Icon, type IconName } from '../../components/icons';

export type CalloutTone = 'info' | 'neutral' | 'warn' | 'success';

export const CALLOUT_ICONS: IconName[] = ['Callout', 'Pin', 'Star', 'Sparkle', 'Check', 'Quote'];

/** A highlighted note block. Tone + icon are attributes; the body is editable inline text. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'info' as CalloutTone,
        parseHTML: (el) => (el.getAttribute('data-tone') as CalloutTone) ?? 'info',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone }),
      },
      icon: {
        default: 'Callout' as IconName,
        parseHTML: (el) => el.getAttribute('data-icon') ?? 'Callout',
        renderHTML: (attrs) => ({ 'data-icon': attrs.icon }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
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
