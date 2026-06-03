import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookDetail, UpdateBookInput } from '@blockpress/shared';
import { booksApi, uploadsApi } from '../lib/api';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { Panel } from './Panel';
import { BookCover } from './ui/BookCover';

/**
 * Book-level editor (right panel). Edits cover, title/author/subtitle/year, and a
 * buy link. Saves via booksApi.update (text fields debounced, cover/buy-link saved
 * on commit).
 */
export function BookSettings({ book, onClose }: { book: BookDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [subtitle, setSubtitle] = useState(book.subtitle);
  const [year, setYear] = useState(book.year);
  const [slug, setSlug] = useState(book.slug ?? '');
  const [buyLink, setBuyLink] = useState(book.buyLink ?? '');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (patch: Partial<UpdateBookInput>) => booksApi.update(book.id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['book', book.id] });
      await qc.invalidateQueries({ queryKey: ['books'] });
    },
    onError: () => setErr('Save failed'),
  });
  const debouncedSave = useDebouncedCallback(
    (patch: Partial<UpdateBookInput>) => save.mutate(patch),
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

  const commitSlug = async () => {
    const v = slug.trim().toLowerCase();
    if (!v || v === (book.slug ?? '')) {
      setErr(null);
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) {
      setErr('Slug must be lowercase letters, digits and single hyphens');
      return;
    }
    setErr(null);
    try {
      const updated = await save.mutateAsync({ slug: v });
      setSlug(updated.slug ?? v); // server may de-dupe (e.g. add -2); reflect the stored value
    } catch {
      /* onError already set the message */
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
      <Panel.Head icon="Book" title="Book details" subtitle={book.title} onClose={onClose} />

      <Panel.Section label="Cover">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <BookCover book={book} className="cover" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : book.coverUrl ? 'Replace cover' : 'Upload cover'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                hidden
                onChange={(e) => onCover(e.target.files?.[0])}
              />
            </label>
            {book.coverUrl && (
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

      <Panel.Section label="Web address">
        <Panel.Field label="URL slug">
          <input
            className="input"
            value={slug}
            placeholder="my-book-title"
            onChange={(e) => setSlug(e.target.value)}
            onBlur={commitSlug}
          />
        </Panel.Field>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>
          Lowercase letters, digits and hyphens — used for clean book URLs.
        </p>
      </Panel.Section>

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

      {err && (
        <Panel.Section>
          <p style={{ color: '#c0392b', fontSize: 12, margin: 0 }}>{err}</p>
        </Panel.Section>
      )}
    </Panel>
  );
}
