import { readingTimeMinutes, type PublishStatus } from '@stockmaster/shared';
import { Panel } from './Panel';
import { Icons } from './icons';

export function PageSettings({
  chapterTitle,
  title,
  status,
  tags,
  words,
  blocks,
  updatedLabel,
  onTitle,
  onStatus,
}: {
  chapterTitle: string;
  title: string;
  status: PublishStatus;
  tags: string[];
  words: number;
  blocks: number;
  updatedLabel: string;
  onTitle: (value: string) => void;
  onStatus: (value: PublishStatus) => void;
}) {
  return (
    <Panel>
      <Panel.Head icon="Doc" title="Page" subtitle={chapterTitle} />

      <Panel.Section>
        <Panel.Field label="Page title">
          <input
            className="input"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Untitled page"
          />
        </Panel.Field>
        <Panel.Field label="Status">
          <Panel.Seg
            value={status}
            onChange={onStatus}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ]}
          />
        </Panel.Field>
      </Panel.Section>

      <Panel.Section label="Statistics">
        <Panel.Stat k="Words" v={words.toLocaleString()} />
        <Panel.Stat k="Blocks" v={blocks} />
        <Panel.Stat k="Reading time" v={`${readingTimeMinutes(words)} min`} />
        <Panel.Stat
          k="Last edited"
          v={<span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{updatedLabel}</span>}
        />
      </Panel.Section>

      {tags.length > 0 && (
        <Panel.Section label="Book tags">
          <div className="tag-row">
            {tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        </Panel.Section>
      )}

      <Panel.Section label="Tip">
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Press <kbd className="kbd">/</kbd> on an empty line for blocks, drag the{' '}
          <Icons.Grip style={{ width: 14, height: 14, verticalAlign: '-2px' }} /> handle to reorder,
          or select text for formatting.
        </p>
      </Panel.Section>
    </Panel>
  );
}
