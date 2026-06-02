import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateWorkInput, WorkDetail } from '@blockpress/shared';
import { uploadsApi, worksApi } from '../lib/api';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { Panel } from './Panel';
import { BookCover } from './ui/BookCover';

/**
 * Work-level editor (right panel). Edits cover, title/author/subtitle/year, and —
 * for books only — a buy link. Saves via worksApi.update (text fields debounced,
 * cover/buy-link saved on commit). Buy link is books-only by UI; the API accepts it
 * on any work but only books surface it.
 */
export function WorkSettings({ work, onClose }: { work: WorkDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const isBook = work.kind === 'book';
  const [title, setTitle] = useState(work.title);
  const [author, setAuthor] = useState(work.author);
  const [subtitle, setSubtitle] = useState(work.subtitle);
  const [year, setYear] = useState(work.year);
  const [buyLink, setBuyLink] = useState(work.buyLink ?? '');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (patch: Partial<UpdateWorkInput>) => worksApi.update(work.id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['work', work.id] });
      await qc.invalidateQueries({ queryKey: ['works'] });
    },
    onError: () => setErr('Save failed'),
  });
  const debouncedSave = useDebouncedCallback(
    (patch: Partial<UpdateWorkInput>) => save.mutate(patch),
    600,
  );

  const onCover = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const { url } = await uploadsApi.upload(file);
      save.mutate({ coverUrl: url });
    } catch {
      setErr('Cover upload failed (PNG/JPEG/WebP/GIF/AVIF, ≤15MB)');
    } finally {
      setUploading(false);
    }
  };

  const commitBuyLink = () => {
    const v = buyLink.trim();
    if (!v) {
      setErr(null);
      save.mutate({ buyLink: null });
      return;
    }
    const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      // eslint-disable-next-line no-new
      new URL(normalized);
    } catch {
      setErr('Buy link must be a valid URL');
      return;
    }
    setErr(null);
    setBuyLink(normalized);
    save.mutate({ buyLink: normalized });
  };

  return (
    <Panel>
      <Panel.Head
        icon={isBook ? 'Book' : 'Doc'}
        title={isBook ? 'Book details' : 'Article details'}
        subtitle={work.title}
        onClose={onClose}
      />

      <Panel.Section label="Cover">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <BookCover work={work} className="cover" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : work.coverUrl ? 'Replace cover' : 'Upload cover'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                hidden
                onChange={(e) => onCover(e.target.files?.[0])}
              />
            </label>
            {work.coverUrl && (
              <button className="btn btn-ghost" onClick={() => save.mutate({ coverUrl: null })}>
                Remove cover
              </button>
            )}
          </div>
        </div>
      </Panel.Section>

      <Panel.Section label="Details">
        <Panel.Field label="Title">
          <input
            className="input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) debouncedSave({ title: e.target.value });
            }}
          />
        </Panel.Field>
        <Panel.Field label="Author">
          <input
            className="input"
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              debouncedSave({ author: e.target.value });
            }}
          />
        </Panel.Field>
        <Panel.Field label="Subtitle">
          <input
            className="input"
            value={subtitle}
            onChange={(e) => {
              setSubtitle(e.target.value);
              debouncedSave({ subtitle: e.target.value });
            }}
          />
        </Panel.Field>
        <Panel.Field label="Year">
          <input
            className="input"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              debouncedSave({ year: e.target.value });
            }}
          />
        </Panel.Field>
      </Panel.Section>

      {isBook && (
        <Panel.Section label="Buy link">
          <Panel.Field label="Purchase URL">
            <input
              className="input"
              value={buyLink}
              placeholder="https://…"
              onChange={(e) => setBuyLink(e.target.value)}
              onBlur={commitBuyLink}
            />
          </Panel.Field>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>
            Shown as a “Buy” button on the book card and reader.
          </p>
        </Panel.Section>
      )}

      {err && (
        <Panel.Section>
          <p style={{ color: '#c0392b', fontSize: 12, margin: 0 }}>{err}</p>
        </Panel.Section>
      )}
    </Panel>
  );
}
