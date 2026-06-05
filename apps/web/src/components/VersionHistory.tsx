import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VersionSummary } from '@stockmaster/shared';
import { articlesApi, booksApi } from '../lib/api';
import { Panel } from './Panel';
import { Icons } from './icons';

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

  const { data: versions = [], isLoading } = useQuery({
    queryKey: [detailKey, id, 'versions'],
    queryFn: () => api.listVersions(id),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => api.restoreVersion(id, versionId),
    onSuccess: async () => {
      setErr(null);
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
        versions.map((v: VersionSummary) => (
          <Panel.Section key={v.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Version {v.versionNumber}</span>
              {v.isPublished && (
                <span className="status published" style={{ fontSize: 12 }}>
                  <span className="led" />
                  Live
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.5 }}>
              {fmtDate(v.createdAt)} · {v.wordCount.toLocaleString()} words
              {v.pageCount != null ? ` · ${v.pageCount} pages` : ''}
            </div>
            {v.note && (
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.5 }}>
                {v.note}
              </p>
            )}
            {!v.isPublished && (
              <button
                className="btn btn-secondary"
                style={{ marginTop: 8 }}
                disabled={restore.isPending}
                onClick={() => restore.mutate(v.id)}
              >
                Restore this version
              </button>
            )}
          </Panel.Section>
        ))
      )}

      {err && (
        <Panel.Section>
          <p style={{ color: '#c0392b', fontSize: 12, margin: 0 }}>{err}</p>
        </Panel.Section>
      )}
    </Panel>
  );
}
