import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  readingTimeMinutes,
  slugSchema,
  type ArticleDetail,
  type UpdateArticleInput,
} from '@stockmaster/shared';
import { articlesApi, uploadsApi } from '../lib/api';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { Panel } from './Panel';
import { BookCover } from './ui/BookCover';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

/**
 * Article-level editor (right panel). Edits cover, subtitle/author/year, tags and the
 * URL slug (the title lives in the canvas editor surface). Visibility is no longer set
 * here — it changes only through Publish / Unpublish in the editor topbar.
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
        <div className="flex flex-col items-start gap-[10px]">
          <BookCover
            book={article}
            className="h-[176px] w-[128px] flex-none rounded-md bg-subtle object-cover shadow-sm"
          />
          <div className="flex flex-col items-start gap-1.5">
            <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-line-strong bg-canvas px-3.5 py-2 text-[13px] font-semibold tracking-[-0.01em] text-fg shadow-xs transition-[background-color,border-color,box-shadow,opacity] duration-[120ms] hover:bg-hover">
              {uploading ? 'Uploading…' : article.coverUrl ? 'Replace cover' : 'Upload cover'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                hidden
                onChange={(e) => onCover(e.target.files?.[0])}
              />
            </label>
            {article.coverUrl && (
              <Button variant="ghost" onClick={() => save.mutate({ coverUrl: null })}>
                Remove cover
              </Button>
            )}
          </div>
        </div>
      </Panel.Section>

      <Panel.Section label="Details">
        <Panel.Field label="Author">
          <Input
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              debouncedSave({ author: e.target.value });
            }}
          />
        </Panel.Field>
        <Panel.Field label="Subtitle">
          <Input
            value={subtitle}
            onChange={(e) => {
              setSubtitle(e.target.value);
              debouncedSave({ subtitle: e.target.value });
            }}
          />
        </Panel.Field>
        <Panel.Field label="Year">
          <Input
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              debouncedSave({ year: e.target.value });
            }}
          />
        </Panel.Field>
      </Panel.Section>

      <Panel.Section label="URL slug">
        <Panel.Field label="Slug">
          <Input
            value={slug}
            placeholder="my-article"
            onChange={(e) => setSlug(e.target.value)}
            onBlur={commitSlug}
          />
        </Panel.Field>
        <p className="m-0 mt-1 text-xs leading-[1.4] text-faint">
          The article&apos;s URL-friendly identifier. Lowercase letters, digits and hyphens.
        </p>
      </Panel.Section>

      <Panel.Section label="Tags">
        <Panel.Field label="Tags (comma-separated)">
          <Input
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
          <p className="m-0 text-xs text-[#c0392b]">{err}</p>
        </Panel.Section>
      )}
    </Panel>
  );
}
