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

const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** One read-only TipTap doc (reuses the editor in non-editable mode, like the reader). */
function ReadonlyDoc({ content }: { content: TiptapDoc }) {
  const editor = useBlockEditor({ content, editable: false });
  return editor ? <EditorContent editor={editor} /> : null;
}

/** Inline word-diff segments → green additions / red strikethrough removals. */
function DiffText({ segments }: { segments: DiffSeg[] }) {
  if (segments.length === 0) return <p className="muted vv-nochange">No text changes.</p>;
  return (
    <p className="vv-diff">
      {segments.map((s, i) => (
        <span key={i} className={s.added ? 'diff-ins' : s.removed ? 'diff-del' : undefined}>
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

/** Added / removed colour key for the diff view. */
function DiffLegend() {
  return (
    <div className="vv-legend">
      <span>
        <i className="ins" />
        Added
      </span>
      <span>
        <i className="del" />
        Removed
      </span>
    </div>
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-xl version-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Timeline (left) ─────────────────────────────────────────────── */}
        <aside className="vv-timeline">
          <div className="vv-timeline-head">
            <Icons.Clock />
            <span>Versions</span>
          </div>
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  className={'vv-item' + (v.id === selectedId ? ' active' : '')}
                  data-live={v.isPublished || undefined}
                  onClick={() => setSelectedId(v.id)}
                >
                  <span className="vv-item-row">
                    <strong>Version {v.versionNumber}</strong>
                    {v.isPublished && (
                      <span className="status published" style={{ fontSize: 11 }}>
                        <span className="led" />
                        Live
                      </span>
                    )}
                  </span>
                  <span className="muted vv-item-meta">
                    {fmtDateTime(v.createdAt)} · {v.wordCount.toLocaleString()} words
                    {v.pageCount != null ? ` · ${v.pageCount}p` : ''}
                  </span>
                  {v.note && <span className="muted vv-item-note">{v.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Detail (right) ──────────────────────────────────────────────── */}
        <section className="vv-detail">
          <header className="vv-detail-head">
            <div>
              <h3>
                Version {selected?.versionNumber}
                {isLive && (
                  <span className="status published" style={{ fontSize: 12, marginLeft: 8 }}>
                    <span className="led" />
                    Live
                  </span>
                )}
              </h3>
              {selected && <p className="muted">{fmtDateTime(selected.createdAt)}</p>}
            </div>
            <div className="vv-detail-actions">
              {!isLive && (
                <button
                  className="btn btn-secondary"
                  disabled={restoreBusy}
                  onClick={() => onRestore(selectedId)}
                >
                  {restoreBusy ? 'Restoring…' : 'Restore this version'}
                </button>
              )}
              <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
                <Icons.X />
              </button>
            </div>
          </header>

          <div className="vv-tabs">
            <button
              className={'vv-tab' + (mode === 'preview' ? ' active' : '')}
              onClick={() => setMode('preview')}
            >
              Preview
            </button>
            <button
              className={'vv-tab' + (mode === 'changes' ? ' active' : '')}
              onClick={() => setMode('changes')}
            >
              Changes
            </button>
            {mode === 'changes' && (
              <label className="vv-compare">
                <span className="muted">Compared to</span>
                <select
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

          <div className="vv-body bp-reader">
            {selQ.isLoading ? (
              <p className="muted">Loading…</p>
            ) : !selQ.data ? (
              <p className="muted">Could not load this version.</p>
            ) : mode === 'preview' ? (
              <PreviewBody kind={kind} detail={selQ.data} />
            ) : baseQ.isLoading ? (
              <p className="muted">Loading comparison…</p>
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
      <article className="vv-page">
        <h2>{snap.article.title || 'Untitled'}</h2>
        <ReadonlyDoc content={snap.content} />
      </article>
    );
  }
  const snap = (detail as BookVersionDetail).snapshot;
  if (snap.chapters.length === 0) return <p className="muted">This version has no published pages.</p>;
  return (
    <>
      {snap.chapters.map((c) => (
        <section key={c.id} className="vv-chapter">
          <h4 className="vv-chapter-title">{c.title || 'Untitled chapter'}</h4>
          {c.pages.map((p) => (
            <article key={p.id} className="vv-page">
              <h2>{p.title || 'Untitled page'}</h2>
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
      <div className="vv-page">
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
      <div className="vv-summary">
        {diff.changedCount === 0
          ? 'No changes from the comparison version'
          : `${diff.changedCount} page${diff.changedCount === 1 ? '' : 's'} changed`}
        {diff.reordered ? ' · pages reordered' : ''}
      </div>
      {diff.pages.map((p) => (
        <article key={p.id} className={'vv-page vv-change vv-' + p.change}>
          <h2>
            <span className={'vv-badge vv-badge-' + p.change}>{CHANGE_LABEL[p.change]}</span>
            {p.label}
            {p.titleChanged && <span className="muted vv-title-changed"> (title changed)</span>}
          </h2>
          {p.change !== 'unchanged' && <DiffText segments={p.segments} />}
        </article>
      ))}
    </>
  );
}
