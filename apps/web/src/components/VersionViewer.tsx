import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EditorContent } from '@tiptap/react';
import type { TiptapDoc, VersionSummary } from '@stockmaster/shared';
import { articlesApi, booksApi, type BookVersionDetail, type ArticleVersionDetail } from '../lib/api';
import { useBlockEditor } from '../editor/useBlockEditor';
import {
  diffArticleSnapshots,
  diffBookSnapshots,
  type DiffSeg,
  type PageDiff,
} from '../lib/versionDiff';
import { Icons } from './icons';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// Inline word-diff chip styles (added / removed). Kept as constants so the long
// arbitrary color-mix values don't clutter the JSX.
const INS = 'rounded-[3px] px-px bg-[color-mix(in_oklch,var(--green)_18%,transparent)] text-[color-mix(in_oklch,var(--green)_72%,var(--text))]';
const DEL = 'rounded-[3px] px-px line-through decoration-[color-mix(in_oklch,var(--red)_55%,transparent)] bg-[color-mix(in_oklch,var(--red)_13%,transparent)] text-red';

/** One read-only TipTap doc (reuses the editor in non-editable mode, like the reader). */
function ReadonlyDoc({ content }: { content: TiptapDoc }) {
  const editor = useBlockEditor({ content, editable: false });
  return editor ? <EditorContent editor={editor} /> : null;
}

/** Inline word-diff segments → green additions / red strikethrough removals. */
function DiffText({ segments }: { segments: DiffSeg[] }) {
  if (segments.length === 0) return <p className="m-0 text-[13px] italic text-faint">No text changes.</p>;
  return (
    <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.75] text-muted">
      {segments.map((s, i) => (
        <span key={i} className={s.added ? INS : s.removed ? DEL : undefined}>
          {s.value}
        </span>
      ))}
    </p>
  );
}

const CHANGE_LABEL: Record<PageDiff['change'], string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  unchanged: 'Unchanged',
};
const BADGE: Record<PageDiff['change'], string> = {
  added: 'bg-green/15 text-[color-mix(in_oklch,var(--green)_76%,var(--text))]',
  removed: 'bg-red/15 text-red',
  changed: 'bg-amber/20 text-[color-mix(in_oklch,var(--amber)_80%,var(--text))]',
  unchanged: 'bg-subtle text-faint',
};
const BORDER: Record<PageDiff['change'], string> = {
  added: 'border-l-green',
  removed: 'border-l-red',
  changed: 'border-l-amber',
  unchanged: 'border-l-line opacity-60',
};

/** Added / removed colour key for the diff view. */
function DiffLegend() {
  return (
    <div className="mb-[18px] flex gap-4 text-[11.5px] text-faint">
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-[11px] w-[11px] rounded-[3px] bg-green/20" />
        Added
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-[11px] w-[11px] rounded-[3px] bg-red/15" />
        Removed
      </span>
    </div>
  );
}

/** A small "Live" pill (the current public version). */
function LivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-green">
      <span className="h-1.5 w-1.5 rounded-full bg-green" />
      Live
    </span>
  );
}

/**
 * Full-screen version explorer: a timeline of every published version on the left, and a
 * Preview / Changes view of the selected version on the right. "Changes" diffs the selected
 * version against a chosen baseline (defaults to the immediately previous version), so you
 * can see exactly what each version changed. Works for books and articles.
 */
export function VersionViewer({
  id,
  kind,
  versions,
  initialVersionId,
  onClose,
  onRestore,
  restoreBusy,
}: {
  id: string;
  kind: 'book' | 'article';
  versions: VersionSummary[];
  initialVersionId: string;
  onClose: () => void;
  onRestore: (versionId: string) => void;
  restoreBusy: boolean;
}) {
  const detailKey = kind === 'book' ? 'book' : 'article';
  // One typed fetcher — picking the api inline (booksApi | articlesApi) defeats react-query's
  // TData inference, so wrap it in a function with a single explicit union return type.
  const getVersion = (versionId: string): Promise<BookVersionDetail | ArticleVersionDetail> =>
    kind === 'book' ? booksApi.getVersion(id, versionId) : articlesApi.getVersion(id, versionId);

  // Versions are passed newest-first. Selected = the version being viewed.
  const [selectedId, setSelectedId] = useState(initialVersionId);
  const [mode, setMode] = useState<'preview' | 'changes'>('preview');

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0];
  // Default diff baseline: the version immediately before the selected one.
  const previous = useMemo(
    () => versions.find((v) => v.versionNumber === (selected?.versionNumber ?? 0) - 1) ?? null,
    [versions, selected],
  );
  const [baselineId, setBaselineId] = useState<string | null>(previous?.id ?? null);
  // Keep the baseline sensible when the selection changes.
  useEffect(() => {
    setBaselineId(previous?.id ?? null);
  }, [previous?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selQ = useQuery({
    queryKey: [detailKey, id, 'version', selectedId],
    queryFn: () => getVersion(selectedId),
    enabled: !!selectedId,
  });
  const baseQ = useQuery({
    queryKey: [detailKey, id, 'version', baselineId],
    queryFn: () => getVersion(baselineId as string),
    enabled: mode === 'changes' && !!baselineId,
  });

  const isLive = selected?.isPublished ?? false;
  const tab = (active: boolean) =>
    'mr-[22px] border-b-2 py-3 text-[13px] transition-colors ' +
    (active
      ? 'border-primary font-semibold text-fg'
      : 'border-transparent font-medium text-muted hover:text-fg');

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-[rgba(28,28,26,0.45)] p-4 backdrop-blur-[3px] animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="grid h-[min(84vh,840px)] w-[min(1140px,100%)] grid-cols-[280px_1fr] overflow-hidden rounded-lg border border-line bg-canvas shadow-lg animate-modal-in"
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Timeline (left) ─────────────────────────────────────────────── */}
        <aside className="overflow-y-auto border-r border-line bg-gradient-to-b from-sidebar to-subtle px-3.5 py-[18px]">
          <div className="flex items-center gap-[7px] px-2 pb-3.5 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
            <Icons.Clock className="size-3.5" />
            <span>Versions</span>
          </div>
          <ul className="relative m-0 list-none p-0 pl-3.5">
            {/* connector rail */}
            <span className="pointer-events-none absolute left-1 top-[18px] bottom-[18px] w-0.5 rounded bg-line-strong" />
            {versions.map((v) => {
              const active = v.id === selectedId;
              return (
                <li key={v.id} className="relative">
                  <button
                    className={
                      'flex w-full flex-col gap-1 rounded-md border px-3 py-[11px] text-left transition-colors ' +
                      (active
                        ? 'border-line-strong bg-canvas shadow-sm'
                        : 'border-transparent hover:bg-hover')
                    }
                    onClick={() => setSelectedId(v.id)}
                  >
                    {/* node */}
                    <span
                      className={
                        'absolute -left-3.5 top-[15px] h-[11px] w-[11px] rounded-full border-2 ' +
                        (v.isPublished
                          ? 'border-green bg-green ring-4 ring-green/20'
                          : active
                            ? 'border-primary bg-canvas'
                            : 'border-line-strong bg-canvas')
                      }
                    />
                    <span className="flex items-center gap-2">
                      <strong className="text-[13.5px] tracking-[-0.01em]">Version {v.versionNumber}</strong>
                      {v.isPublished && <LivePill />}
                    </span>
                    <span className="text-[11px] tabular-nums tracking-[0.01em] text-faint">
                      {fmtDateTime(v.createdAt)} · {v.wordCount.toLocaleString()} words
                      {v.pageCount != null ? ` · ${v.pageCount}p` : ''}
                    </span>
                    {v.note && <span className="text-[11.5px] italic leading-snug text-muted">{v.note}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Detail (right) ──────────────────────────────────────────────── */}
        <section className="flex min-w-0 flex-col overflow-hidden bg-canvas">
          <header className="flex items-start justify-between gap-3 border-b border-line px-6 pb-4 pt-5">
            <div>
              <h3 className="m-0 flex items-center text-[19px] font-semibold tracking-[-0.02em]">
                Version {selected?.versionNumber}
                {isLive && (
                  <span className="ml-2">
                    <LivePill />
                  </span>
                )}
              </h3>
              {selected && <p className="m-0 mt-[3px] text-xs tabular-nums text-faint">{fmtDateTime(selected.createdAt)}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isLive && (
                <Button
                  variant="secondary"
                  disabled={restoreBusy}
                  onClick={() => onRestore(selectedId)}
                >
                  {restoreBusy ? 'Restoring…' : 'Restore this version'}
                </Button>
              )}
              <IconButton aria-label="Close" title="Close" onClick={onClose}>
                <Icons.X />
              </IconButton>
            </div>
          </header>

          <div className="flex items-center border-b border-line px-6">
            <button className={tab(mode === 'preview')} onClick={() => setMode('preview')}>
              Preview
            </button>
            <button className={tab(mode === 'changes')} onClick={() => setMode('changes')}>
              Changes
            </button>
            {mode === 'changes' && (
              <label className="ml-auto flex items-center gap-2 text-[11.5px] uppercase tracking-[0.05em] text-faint">
                <span>Compared to</span>
                <select
                  className="rounded-md border border-line-strong bg-canvas px-2.5 py-1 text-[12.5px] font-medium normal-case tracking-normal text-fg shadow-xs"
                  value={baselineId ?? ''}
                  onChange={(e) => setBaselineId(e.target.value || null)}
                >
                  <option value="">Nothing (initial)</option>
                  {versions
                    .filter((v) => v.id !== selectedId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.versionNumber}
                        {v.versionNumber === (selected?.versionNumber ?? 0) - 1 ? ' (previous)' : ''}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          <div className="max-w-[820px] flex-1 overflow-y-auto px-7 pb-9 pt-[22px]">
            {selQ.isLoading ? (
              <p className="text-muted">Loading…</p>
            ) : !selQ.data ? (
              <p className="text-muted">Could not load this version.</p>
            ) : mode === 'preview' ? (
              <PreviewBody kind={kind} detail={selQ.data} />
            ) : baseQ.isLoading ? (
              <p className="text-muted">Loading comparison…</p>
            ) : (
              <ChangesBody kind={kind} selected={selQ.data} baseline={baseQ.data ?? null} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PreviewBody({
  kind,
  detail,
}: {
  kind: 'book' | 'article';
  detail: BookVersionDetail | ArticleVersionDetail;
}) {
  if (kind === 'article') {
    const snap = (detail as ArticleVersionDetail).snapshot;
    return (
      <article className="mb-[26px]">
        <h2 className="m-0 mb-2 text-[17px] font-semibold tracking-[-0.02em]">{snap.article.title || 'Untitled'}</h2>
        <ReadonlyDoc content={snap.content} />
      </article>
    );
  }
  const snap = (detail as BookVersionDetail).snapshot;
  if (snap.chapters.length === 0) return <p className="text-muted">This version has no published pages.</p>;
  return (
    <>
      {snap.chapters.map((c) => (
        <section key={c.id}>
          <h4 className="mb-2.5 mt-[22px] flex items-center gap-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
            {c.title || 'Untitled chapter'}
            <span className="h-px flex-1 bg-line" />
          </h4>
          {c.pages.map((p) => (
            <article key={p.id} className="mb-[26px]">
              <h2 className="m-0 mb-2 text-[17px] font-semibold tracking-[-0.02em]">{p.title || 'Untitled page'}</h2>
              <ReadonlyDoc content={p.content} />
            </article>
          ))}
        </section>
      ))}
    </>
  );
}

function ChangesBody({
  kind,
  selected,
  baseline,
}: {
  kind: 'book' | 'article';
  selected: BookVersionDetail | ArticleVersionDetail;
  baseline: BookVersionDetail | ArticleVersionDetail | null;
}) {
  if (kind === 'article') {
    const segs = diffArticleSnapshots(
      baseline ? (baseline as ArticleVersionDetail).snapshot : null,
      (selected as ArticleVersionDetail).snapshot,
    );
    return (
      <div className="mb-[26px]">
        <DiffLegend />
        <DiffText segments={segs} />
      </div>
    );
  }

  const diff = diffBookSnapshots(
    baseline ? (baseline as BookVersionDetail).snapshot : null,
    (selected as BookVersionDetail).snapshot,
  );

  return (
    <>
      <DiffLegend />
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-subtle px-3 py-[5px] text-xs font-medium tabular-nums text-muted">
        {diff.changedCount === 0
          ? 'No changes from the comparison version'
          : `${diff.changedCount} page${diff.changedCount === 1 ? '' : 's'} changed`}
        {diff.reordered ? ' · pages reordered' : ''}
      </div>
      {diff.pages.map((p) => (
        <article key={p.id} className={'mb-[26px] border-l-2 pl-4 ' + BORDER[p.change]}>
          <h2 className="m-0 mb-2 flex flex-wrap items-center gap-[9px] text-[17px] font-semibold tracking-[-0.02em]">
            <span className={'rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[0.07em] ' + BADGE[p.change]}>
              {CHANGE_LABEL[p.change]}
            </span>
            {p.label}
            {p.titleChanged && <span className="text-xs font-normal italic text-faint"> (title changed)</span>}
          </h2>
          {p.change !== 'unchanged' && <DiffText segments={p.segments} />}
        </article>
      ))}
    </>
  );
}
