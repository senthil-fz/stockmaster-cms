import { blankDoc } from '@stockmaster/shared';
import type {
  ArticleDetail,
  ArticleSummary,
  TiptapDoc,
  VersionSummary,
} from '@stockmaster/shared';
import { toPublicCoverUrl } from '../common/media/cover-url';

// Loose row shape for what we select from Prisma.
interface ArticleScalars {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  year: string;
  coverTone: string;
  coverUrl: string | null;
  tags: string[];
  // `status` is derived (no stored column) — published iff a live version is pointed at;
  // `hasUnpublishedChanges` surfaces "published, with newer draft edits."
  publishedVersionId: string | null;
  draftDirty: boolean;
  wordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type ArticleDetailInput = ArticleScalars & { content?: unknown };

export function toArticleSummary(a: ArticleScalars): ArticleSummary {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    subtitle: a.subtitle,
    author: a.author,
    year: a.year,
    coverTone: a.coverTone,
    // Stored domain-free; attach the current API origin on the way out (see cover-url.ts).
    coverUrl: toPublicCoverUrl(a.coverUrl),
    status: a.publishedVersionId ? 'published' : 'draft',
    hasUnpublishedChanges: a.draftDirty,
    tags: a.tags,
    wordCount: a.wordCount,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toArticleDetail(a: ArticleDetailInput): ArticleDetail {
  return {
    ...toArticleSummary(a),
    content: (a.content ?? blankDoc()) as TiptapDoc,
  };
}

// Loose row shape for an ArticleVersion history row (no full snapshot).
interface VersionRow {
  id: string;
  versionNumber: number;
  schemaVersion: number;
  wordCount: number;
  note: string | null;
  createdById: string | null;
  createdAt: Date;
}

/**
 * Map a version row to its history-list summary. `isPublished` marks the one row the
 * article's `publishedVersionId` currently points at. `pageCount` is omitted — articles
 * are a single page.
 */
export function toVersionSummary(
  v: VersionRow,
  publishedVersionId: string | null,
): VersionSummary {
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    schemaVersion: v.schemaVersion,
    wordCount: v.wordCount,
    note: v.note,
    createdById: v.createdById,
    createdAt: v.createdAt.toISOString(),
    isPublished: v.id === publishedVersionId,
  };
}
