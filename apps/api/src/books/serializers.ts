import { blankDoc } from '@stockmaster/shared';
import type {
  BookDetail,
  BookSummary,
  Chapter,
  Page,
  PageSummary,
  PublishStatus,
  TiptapDoc,
} from '@stockmaster/shared';

// Loose row shapes for what we select/include from Prisma.
interface PageRow {
  id: string;
  chapterId: string;
  title: string;
  status: PublishStatus;
  order: number;
  wordCount: number;
  updatedAt: Date;
  content?: unknown;
}
interface ChapterRow {
  id: string;
  bookId: string;
  title: string;
  order: number;
  pages?: PageRow[];
}

interface BookScalars {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string;
  author: string;
  year: string;
  coverTone: string;
  coverUrl: string | null;
  buyLink: string | null;
  // `status` is no longer a column — it is derived from `publishedVersionId` below.
  publishedVersionId: string | null;
  // Drives `hasUnpublishedChanges`: the draft has edits not yet in a published version.
  draftDirty: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Summary only needs each page's wordCount (library list never loads content).
type BookSummaryInput = BookScalars & {
  chapters?: Array<{ pages?: Array<{ wordCount: number }> }>;
};
type BookDetailInput = BookScalars & { chapters?: ChapterRow[] };

export function toPageSummary(p: PageRow): PageSummary {
  return {
    id: p.id,
    chapterId: p.chapterId,
    title: p.title,
    status: p.status,
    order: p.order,
    wordCount: p.wordCount,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toPage(p: PageRow): Page {
  return { ...toPageSummary(p), content: (p.content ?? blankDoc()) as TiptapDoc };
}

export function toChapter(c: ChapterRow): Chapter {
  return {
    id: c.id,
    bookId: c.bookId,
    title: c.title,
    order: c.order,
    pages: (c.pages ?? []).map(toPageSummary),
  };
}

export function toBookSummary(w: BookSummaryInput): BookSummary {
  let pageCount = 0;
  let wordCount = 0;
  for (const ch of w.chapters ?? []) {
    for (const pg of ch.pages ?? []) {
      pageCount += 1;
      wordCount += pg.wordCount ?? 0;
    }
  }
  return {
    id: w.id,
    slug: w.slug,
    title: w.title,
    subtitle: w.subtitle,
    author: w.author,
    year: w.year,
    coverTone: w.coverTone,
    coverUrl: w.coverUrl,
    buyLink: w.buyLink,
    // Published iff a live version exists; the pointer is the sole source of truth.
    status: w.publishedVersionId ? 'published' : 'draft',
    hasUnpublishedChanges: w.draftDirty,
    tags: w.tags,
    pageCount,
    wordCount,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function toBookDetail(w: BookDetailInput): BookDetail {
  return {
    ...toBookSummary(w),
    chapters: (w.chapters ?? []).map(toChapter),
  };
}
