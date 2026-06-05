import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VersionSummary } from '@stockmaster/shared';
import { articlesApi, booksApi } from '../lib/api';
import { Panel } from './Panel';
import { VersionViewer } from './VersionViewer';

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
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Loading…
          </p>
        </Panel.Section>
      ) : versions.length === 0 ? (
        <Panel.Section>
          <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            No versions yet. Publishing captures the current draft as version 1.
          </p>
        </Panel.Section>
      ) : (
        <div className="vh-list">
          {versions.map((v: VersionSummary) => (
            <div className="vh-item" data-live={v.isPublished || undefined} key={v.id}>
              <div className="vh-item-head">
                <span className="vh-vnum">Version {v.versionNumber}</span>
                {v.isPublished && (
                  <span className="vh-live">
                    <span className="led" />
                    Live
                  </span>
                )}
              </div>
              <div className="vh-meta">
                {fmtDate(v.createdAt)} · {v.wordCount.toLocaleString()} words
                {v.pageCount != null ? ` · ${v.pageCount}p` : ''}
              </div>
              {v.note && <div className="vh-note">{v.note}</div>}
              <div className="vh-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setViewerVersionId(v.id)}>
                  View &amp; compare
                </button>
                {!v.isPublished && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(v.id)}
                  >
                    Restore
                  </button>
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
          <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>
        </Panel.Section>
      )}
    </Panel>
  );
}
