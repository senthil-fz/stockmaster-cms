import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  readingTimeMinutes,
  slugSchema,
  type ArticleDetail,
  type PublishStatus,
  type UpdateArticleInput,
} from '@blockpress/shared';
import { articlesApi, uploadsApi } from '../lib/api';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { Panel } from './Panel';
import { BookCover } from './ui/BookCover';

/**
 * Article-level editor (right panel). Edits cover, subtitle/author/year, tags,
 * publish status and the URL slug (the title lives in the canvas editor surface).
 * Saves via articlesApi.update (text fields debounced, cover/slug saved on commit).
 * No buy link, no chapters — an article is a single page.
 */
export function ArticleSettings({
  article,
  words,
  onClose,
}: {
  article: ArticleDetail;
  words: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [author, setAuthor] = useState(article.author);
  const [subtitle, setSubtitle] = useState(article.subtitle);
  const [year, setYear] = useState(article.year);
  const [slug, setSlug] = useState(article.slug);
  const [tagsText, setTagsText] = useState(article.tags.join(', '));
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (patch: Partial<UpdateArticleInput>) => articlesApi.update(article.id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(['article', article.id], updated);
      void qc.invalidateQueries({ queryKey: ['articles'] });
    },
    onError: () => setErr('Save failed'),
  });
  const debouncedSave = useDebouncedCallback(
    (patch: Partial<UpdateArticleInput>) => save.mutate(patch),
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

  const commitSlug = () => {
    const v = slug.trim();
    if (v === article.slug) {
      setErr(null);
      return;
    }
    const parsed = slugSchema.safeParse(v);
    if (!parsed.success) {
      setErr('Slug must be lowercase letters, digits and single hyphens');
      return;
    }
    setErr(null);
    setSlug(parsed.data);
    save.mutate({ slug: parsed.data });
  };

  const commitTags = () => {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    setErr(null);
    save.mutate({ tags });
  };

  return (
    <Panel>
      <Panel.Head icon="Doc" title="Article details" subtitle={article.title} onClose={onClose} />

      <Panel.Section label="Cover">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <BookCover book={article} className="cover" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : article.coverUrl ? 'Replace cover' : 'Upload cover'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                hidden
                onChange={(e) => onCover(e.target.files?.[0])}
              />
            </label>
            {article.coverUrl && (
              <button className="btn btn-ghost" onClick={() => save.mutate({ coverUrl: null })}>
                Remove cover
              </button>
            )}
          </div>
        </div>
      </Panel.Section>

      <Panel.Section label="Details">
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

      <Panel.Section label="Status">
        <Panel.Field label="Publish status">
          <Panel.Seg
            value={article.status}
            onChange={(status: PublishStatus) => save.mutate({ status })}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ]}
          />
        </Panel.Field>
      </Panel.Section>

      <Panel.Section label="URL slug">
        <Panel.Field label="Slug">
          <input
            className="input"
            value={slug}
            placeholder="my-article"
            onChange={(e) => setSlug(e.target.value)}
            onBlur={commitSlug}
          />
        </Panel.Field>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>
          The article&apos;s URL-friendly identifier. Lowercase letters, digits and hyphens.
        </p>
      </Panel.Section>

      <Panel.Section label="Tags">
        <Panel.Field label="Tags (comma-separated)">
          <input
            className="input"
            value={tagsText}
            placeholder="markets, options"
            onChange={(e) => setTagsText(e.target.value)}
            onBlur={commitTags}
          />
        </Panel.Field>
      </Panel.Section>

      <Panel.Section label="Statistics">
        <Panel.Stat k="Words" v={words.toLocaleString()} />
        <Panel.Stat k="Reading time" v={`${readingTimeMinutes(words)} min`} />
      </Panel.Section>

      {err && (
        <Panel.Section>
          <p style={{ color: '#c0392b', fontSize: 12, margin: 0 }}>{err}</p>
        </Panel.Section>
      )}
    </Panel>
  );
}
