import { blankDoc } from '@stockmaster/shared';
import type {
  ArticleSnapshot,
  BookSnapshot,
  SnapshotChapter,
  TiptapDoc,
} from '@stockmaster/shared';

/**
 * Canonical runtime snapshot builders — the single source of the published-snapshot
 * shape, reused by the publish endpoints and the reader. Must stay byte-identical to the
 * Zod contract in `@stockmaster/shared` (version.ts) and the migration backfill SQL.
 *
 * A snapshot stores the already-filtered, already-ordered reading structure (exactly what
 * readers see today): only `status === 'published'` pages, in (chapter.order, page.order)
 * order, with real live page ids preserved. Chapters with no published page are dropped.
 * These are pure functions over the Prisma rows — no DB access, no side effects.
 */

// Loose row shapes for what callers select/include from Prisma.
interface PageRow {
  id: string;
  title: string;
  status: string;
  order: number;
  wordCount: number;
  content?: unknown;
}
interface ChapterRow {
  id: string;
  title: string;
  order: number;
  pages?: PageRow[];
}
interface BookRow {
  title: string;
  subtitle: string;
  author: string;
  year: string;
  coverTone: string;
  coverUrl: string | null;
  buyLink: string | null;
  tags: string[];
  slug: string | null;
  chapters?: ChapterRow[];
}
interface ArticleRow {
  title: string;
  subtitle: string;
  author: string;
  year: string;
  coverTone: string;
  coverUrl: string | null;
  tags: string[];
  slug: string;
  content?: unknown;
  wordCount: number;
}

const byOrderThenId = <T extends { order: number; id: string }>(a: T, b: T): number =>
  a.order - b.order || a.id.localeCompare(b.id);

/**
 * Build the immutable snapshot for a book from its live tree. Filters to published pages,
 * drops empty chapters, and orders everything internally so the result is self-contained
 * regardless of the include's own ordering.
 */
export function buildBookSnapshot(book: BookRow): BookSnapshot {
  const chapters: SnapshotChapter[] = [];
  for (const c of [...(book.chapters ?? [])].sort(byOrderThenId)) {
    const pages = (c.pages ?? [])
      .filter((p) => p.status === 'published')
      .sort(byOrderThenId)
      .map((p) => ({
        id: p.id,
        title: p.title,
        order: p.order,
        wordCount: p.wordCount,
        content: (p.content ?? blankDoc()) as TiptapDoc,
      }));
    if (pages.length === 0) continue; // chapters with no published page are not captured
    chapters.push({ id: c.id, title: c.title, order: c.order, pages });
  }

  return {
    book: {
      title: book.title,
      subtitle: book.subtitle,
      author: book.author,
      year: book.year,
      coverTone: book.coverTone,
      coverUrl: book.coverUrl,
      buyLink: book.buyLink,
      tags: book.tags,
      slug: book.slug,
    },
    chapters,
  };
}

/** Build the immutable snapshot for an article (single TipTap doc + metadata). */
export function buildArticleSnapshot(article: ArticleRow): ArticleSnapshot {
  return {
    article: {
      title: article.title,
      subtitle: article.subtitle,
      author: article.author,
      year: article.year,
      coverTone: article.coverTone,
      coverUrl: article.coverUrl,
      tags: article.tags,
      slug: article.slug,
    },
    content: (article.content ?? blankDoc()) as TiptapDoc,
    wordCount: article.wordCount,
  };
}
