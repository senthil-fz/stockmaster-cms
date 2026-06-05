import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VersionSummary } from '@stockmaster/shared';
import { articlesApi, booksApi, type ArticleDraft, type BookDraft } from '../lib/api';
import { Panel } from './Panel';
import { VersionViewer } from './VersionViewer';
import { Button } from './ui/Button';

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * Version-history panel (right side, reachable from the editor topbar). Lists every
 * published version newest-first and offers a Restore action that repoints the public
 * pointer back to an older version (the working draft is left untouched). Works for
 * both books and articles — `kind` picks the api + the query/cache keys to invalidate.
 */
export function VersionHistory({
  id,
  kind,
  onClose,
}: {
  id: string;
  kind: 'book' | 'article';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const api = kind === 'book' ? booksApi : articlesApi;
  const listKey = kind === 'book' ? 'books' : 'articles';
  const detailKey = kind === 'book' ? 'book' : 'article';
  const [err, setErr] = useState<string | null>(null);
  // When set, the full-screen viewer is open at this version (preview + diff).
  const [viewerVersionId, setViewerVersionId] = useState<string | null>(null);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: [detailKey, id, 'versions'],
    queryFn: () => api.listVersions(id),
  });

  // The live working draft — shown as the first entry so you can preview/compare it.
  const fetchDraft = (): Promise<BookDraft | ArticleDraft> =>
    kind === 'book' ? booksApi.getDraft(id) : articlesApi.getDraft(id);
  const { data: draft } = useQuery({ queryKey: [detailKey, id, 'draft'], queryFn: fetchDraft });

  const restore = useMutation({
    mutationFn: (versionId: string) => api.restoreVersion(id, versionId),
    onSuccess: async () => {
      setErr(null);
      setViewerVersionId(null);
      await qc.invalidateQueries({ queryKey: [detailKey, id, 'versions'] });
      await qc.invalidateQueries({ queryKey: [detailKey, id] });
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: () => setErr('Restore failed'),
  });

  return (
    <Panel>
      <Panel.Head icon="Clock" title="Version history" onClose={onClose} />

      {isLoading ? (
        <Panel.Section>
          <p className="m-0 text-[13px] text-muted">Loading…</p>
        </Panel.Section>
      ) : versions.length === 0 && !draft ? (
        <Panel.Section>
          <p className="m-0 text-[13px] leading-normal text-muted">
            No versions yet. Publishing captures the current draft as version 1.
          </p>
        </Panel.Section>
      ) : (
        <div className="relative px-0.5 pt-1.5 pb-1">
          {/* connector rail running through every node */}
          <span className="pointer-events-none absolute left-[5px] top-[18px] bottom-[22px] w-0.5 rounded bg-line-strong" />

          {/* Current draft — the live working copy, always at the top. */}
          {draft && (
            <div className="relative py-3 pl-[22px]">
              <span
                className={
                  'absolute left-0 top-[15px] h-3 w-3 rounded-full border-2 ' +
                  (draft.hasUnpublishedChanges
                    ? 'border-amber bg-canvas ring-4 ring-amber/20'
                    : 'border-line-strong bg-canvas')
                }
              />
              <div className="flex min-h-4 items-center gap-2">
                <span className="whitespace-nowrap text-[13.5px] font-semibold tracking-[-0.01em] text-fg">
                  Current draft
                </span>
                {draft.hasUnpublishedChanges && (
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-amber">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                    Unpublished
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11.5px] tabular-nums tracking-[0.01em] text-faint">
                Edited {fmtDate(draft.createdAt)} · {draft.wordCount.toLocaleString()} words
                {'pageCount' in draft ? ` · ${draft.pageCount}p` : ''}
              </div>
              <div className="mt-2.5 flex gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => setViewerVersionId('draft')}>
                  View &amp; compare
                </Button>
              </div>
            </div>
          )}

          {versions.map((v: VersionSummary, i: number) => (
            <div
              key={v.id}
              className={'relative py-3 pl-[22px]' + (draft || i > 0 ? ' border-t border-line' : '')}
            >
              {/* timeline node — hollow, or filled green for the live version */}
              <span
                className={
                  'absolute left-0 top-[15px] h-3 w-3 rounded-full border-2 ' +
                  (v.isPublished
                    ? 'border-green bg-green ring-4 ring-green/20'
                    : 'border-line-strong bg-canvas')
                }
              />
              <div className="flex min-h-4 items-center gap-2">
                <span className="whitespace-nowrap text-[13.5px] font-semibold tracking-[-0.01em] text-fg">
                  Version {v.versionNumber}
                </span>
                {v.isPublished && (
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-green">
                    <span className="h-1.5 w-1.5 rounded-full bg-green" />
                    Live
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11.5px] tabular-nums tracking-[0.01em] text-faint">
                {fmtDate(v.createdAt)} · {v.wordCount.toLocaleString()} words
                {v.pageCount != null ? ` · ${v.pageCount}p` : ''}
              </div>
              {v.note && <div className="mt-1.5 text-[11.5px] italic leading-snug text-muted">{v.note}</div>}
              <div className="mt-2.5 flex gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => setViewerVersionId(v.id)}>
                  View &amp; compare
                </Button>
                {!v.isPublished && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(v.id)}
                  >
                    Restore
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerVersionId && (
        <VersionViewer
          id={id}
          kind={kind}
          versions={versions}
          initialVersionId={viewerVersionId}
          onClose={() => setViewerVersionId(null)}
          onRestore={(versionId) => restore.mutate(versionId)}
          restoreBusy={restore.isPending}
        />
      )}

      {err && (
        <Panel.Section>
          <p className="m-0 text-xs text-red">{err}</p>
        </Panel.Section>
      )}
    </Panel>
  );
}
