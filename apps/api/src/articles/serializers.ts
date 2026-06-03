import { blankDoc } from '@blockpress/shared';
import type {
  ArticleDetail,
  ArticleSummary,
  PublishStatus,
  TiptapDoc,
} from '@blockpress/shared';

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
  status: PublishStatus;
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
    coverUrl: a.coverUrl,
    status: a.status,
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
