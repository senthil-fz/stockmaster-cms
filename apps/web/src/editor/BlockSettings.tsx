import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { Panel } from '../components/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Icons, type IconName } from '../components/icons';
import { type CalloutTone } from '@stockmaster/editor-schema';
import { CALLOUT_ICONS } from './extensions/Callout';
import type { ActiveBlock } from './useActiveBlock';

const TYPE_META: Record<string, { label: string; icon: IconName }> = {
  heading: { label: 'Heading', icon: 'Heading' },
  paragraph: { label: 'Text', icon: 'Text' },
  bulletList: { label: 'Bulleted list', icon: 'ListBullet' },
  orderedList: { label: 'Numbered list', icon: 'ListNumber' },
  quote: { label: 'Quote', icon: 'Quote' },
  callout: { label: 'Callout', icon: 'Callout' },
  captionedImage: { label: 'Image', icon: 'Image' },
  divider: { label: 'Divider', icon: 'Divider' },
  table: { label: 'Table', icon: 'Table' },
};

export function BlockSettings({
  editor,
  active,
  onClose,
}: {
  editor: Editor;
  active: ActiveBlock;
  onClose: () => void;
}) {
  const meta = TYPE_META[active.type] ?? { label: 'Block', icon: 'Text' as IconName };
  const attrs = active.attrs;
  const setAttrs = (patch: Record<string, unknown>) =>
    editor.chain().updateAttributes(active.type, patch).run();

  const deleteBlock = () => {
    editor.chain().focus().deleteNode(active.type).run();
    onClose();
  };

  const duplicate = () => {
    const sel = editor.state.selection;
    const node = sel instanceof NodeSelection ? sel.node : sel.$from.node(1);
    const pos = sel instanceof NodeSelection ? sel.from : sel.$from.before(1);
    if (!node) return;
    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize, node.toJSON())
      .run();
  };

  return (
    <Panel>
      <Panel.Head icon={meta.icon} title={`${meta.label} block`} onClose={onClose} />

      {active.type === 'heading' && (
        <Panel.Section label="Level">
          <Panel.Seg
            value={(attrs.level as number) ?? 1}
            onChange={(level) => editor.chain().focus().setNode('heading', { level }).run()}
            options={[
              { value: 1, label: 'H1' },
              { value: 2, label: 'H2' },
              { value: 3, label: 'H3' },
            ]}
          />
        </Panel.Section>
      )}

      {(active.type === 'bulletList' || active.type === 'orderedList') && (
        <Panel.Section label="List style">
          <Panel.Seg
            value={active.type === 'orderedList' ? 'numbered' : 'bullet'}
            onChange={(v) =>
              v === 'bullet'
                ? editor.chain().focus().toggleBulletList().run()
                : editor.chain().focus().toggleOrderedList().run()
            }
            options={[
              { value: 'bullet', icon: 'ListBullet' },
              { value: 'numbered', icon: 'ListNumber' },
            ]}
          />
        </Panel.Section>
      )}

      {active.type === 'divider' && (
        <Panel.Section label="Style">
          <Panel.Seg
            value={(attrs.variant as string) ?? 'line'}
            onChange={(variant) => setAttrs({ variant })}
            options={[
              { value: 'line', label: 'Line' },
              { value: 'dots', label: 'Dots' },
            ]}
          />
        </Panel.Section>
      )}

      {active.type === 'quote' && (
        <Panel.Section label="Citation">
          <Panel.Field label="Attribution">
            <Input
              value={(attrs.cite as string) ?? ''}
              onChange={(e) => setAttrs({ cite: e.target.value })}
              placeholder="Author, year"
            />
          </Panel.Field>
        </Panel.Section>
      )}

      {active.type === 'callout' && (
        <Panel.Section label="Appearance">
          <Panel.Field label="Tone">
            <Panel.Seg
              value={(attrs.tone as string) ?? 'info'}
              onChange={(tone) => setAttrs({ tone })}
              options={[
                { value: 'info', label: 'Info' },
                { value: 'neutral', label: 'Neutral' },
                { value: 'warn', label: 'Warn' },
                { value: 'success', label: 'OK' },
              ]}
            />
          </Panel.Field>
          <Panel.Field label="Icon">
            <div className="tag-row">
              {CALLOUT_ICONS.map((name) => {
                const on = attrs.icon === name;
                const I = Icons[name];
                return (
                  <button
                    key={name}
                    className="tag"
                    style={{
                      padding: '6px 9px',
                      background: on ? 'var(--accent-soft)' : 'var(--bg-canvas)',
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                    onClick={() => setAttrs({ icon: name })}
                  >
                    <I style={{ width: 16, height: 16 }} />
                  </button>
                );
              })}
            </div>
          </Panel.Field>
        </Panel.Section>
      )}

      {active.type === 'captionedImage' && (
        <Panel.Section label="Image">
          <Panel.Field label="Source URL">
            <Input
              value={(attrs.src as string) ?? ''}
              onChange={(e) => setAttrs({ src: e.target.value })}
              placeholder="https://…"
            />
          </Panel.Field>
          <Panel.Field label="Width">
            <Panel.Seg
              value={(attrs.align as string) ?? 'full'}
              onChange={(align) => setAttrs({ align })}
              options={[
                { value: 'full', label: 'Full' },
                { value: 'left', label: 'Inset' },
              ]}
            />
          </Panel.Field>
          <Panel.Field label="Caption">
            <Input
              value={(attrs.caption as string) ?? ''}
              onChange={(e) => setAttrs({ caption: e.target.value })}
              placeholder="Figure caption"
            />
          </Panel.Field>
        </Panel.Section>
      )}

      {active.type === 'table' && (
        <Panel.Section label="Table">
          <Panel.Field label="Header row">
            <Button
              variant="secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            >
              Toggle header row
            </Button>
          </Panel.Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <Button
              variant="secondary"
              style={{ justifyContent: 'center' }}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              + Row
            </Button>
            <Button
              variant="secondary"
              style={{ justifyContent: 'center' }}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              + Column
            </Button>
            <Button
              variant="ghost"
              style={{ justifyContent: 'center' }}
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              − Row
            </Button>
            <Button
              variant="ghost"
              style={{ justifyContent: 'center' }}
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              − Column
            </Button>
          </div>
        </Panel.Section>
      )}

      <Panel.Section label="Actions">
        <Button
          variant="ghost"
          style={{ width: '100%', justifyContent: 'flex-start' }}
          onClick={duplicate}
        >
          <Icons.Copy /> Duplicate block
        </Button>
        <Button
          variant="ghost"
          className="danger-btn"
          style={{ width: '100%', justifyContent: 'flex-start' }}
          onClick={deleteBlock}
        >
          <Icons.Trash /> Delete block
        </Button>
      </Panel.Section>
    </Panel>
  );
}
