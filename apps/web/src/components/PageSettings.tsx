import { readingTimeMinutes, type PublishStatus } from '@stockmaster/shared';
import { Panel } from './Panel';
import { Icons } from './icons';
import { Input } from './ui/Input';

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
          <Input
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
          v={<span className="font-medium text-muted">{updatedLabel}</span>}
        />
      </Panel.Section>

      {tags.length > 0 && (
        <Panel.Section label="Book tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-[5px] rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        </Panel.Section>
      )}

      <Panel.Section label="Tip">
        <p className="m-0 text-[13px] leading-[1.5] text-faint">
          Press{' '}
          <kbd className="rounded-[4px] border border-line bg-canvas px-1.5 py-px font-mono text-xs">
            /
          </kbd>{' '}
          on an empty line for blocks, drag the{' '}
          <Icons.Grip style={{ width: 14, height: 14, verticalAlign: '-2px' }} /> handle to reorder,
          or select text for formatting.
        </p>
      </Panel.Section>
    </Panel>
  );
}
