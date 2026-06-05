// Spec lives in @stockmaster/editor-schema; this file only re-attaches the React NodeView.
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Callout as CalloutBase, type CalloutTone } from '@stockmaster/editor-schema';
import { Icon, type IconName } from '../../components/icons';

export const CALLOUT_ICONS: IconName[] = ['Callout', 'Pin', 'Star', 'Sparkle', 'Check', 'Quote'];

export const Callout = CalloutBase.extend({
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});

const CALLOUT_TONE_CLASS: Record<CalloutTone, string> = {
  info: 'bg-[color-mix(in_oklch,var(--accent)_12%,white)] border-[color-mix(in_oklch,var(--accent)_35%,transparent)]',
  neutral: 'bg-subtle border-line',
  warn: 'bg-[color-mix(in_oklch,var(--amber)_14%,white)] border-[color-mix(in_oklch,var(--amber)_40%,transparent)]',
  success: 'bg-[color-mix(in_oklch,var(--green)_12%,white)] border-[color-mix(in_oklch,var(--green)_38%,transparent)]',
};

function CalloutView({ node }: NodeViewProps) {
  const tone = (node.attrs.tone as CalloutTone) ?? 'info';
  const icon = (node.attrs.icon as IconName) || 'Callout';
  return (
    <NodeViewWrapper
      className={
        'flex gap-3 px-4 py-[14px] rounded-lg border text-[15px] leading-[1.55] dark:bg-[color-mix(in_oklch,var(--accent)_22%,var(--bg-canvas))] ' +
        CALLOUT_TONE_CLASS[tone]
      }
    >
      <span className="flex-none leading-[1.4] text-fg" contentEditable={false}>
        <Icon name={icon} style={{ width: 19, height: 19 }} />
      </span>
      <NodeViewContent className="flex-1 min-w-0 outline-none" />
    </NodeViewWrapper>
  );
}
