import type {
  Chapter,
  Page,
  PageSummary,
  PublishStatus,
  TiptapDoc,
  WorkDetail,
  WorkKind,
  WorkSummary,
} from '@blockpress/shared';

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
  workId: string;
  title: string;
  order: number;
  pages?: PageRow[];
}

interface WorkScalars {
  id: string;
  kind: WorkKind;
  title: string;
  subtitle: string;
  author: string;
  year: string;
  coverTone: string;
  coverUrl: string | null;
  buyLink: string | null;
  status: PublishStatus;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Summary only needs each page's wordCount (library list never loads content).
type WorkSummaryInput = WorkScalars & {
  chapters?: Array<{ pages?: Array<{ wordCount: number }> }>;
};
type WorkDetailInput = WorkScalars & { chapters?: ChapterRow[] };

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
  return { ...toPageSummary(p), content: (p.content ?? { type: 'doc' }) as TiptapDoc };
}

export function toChapter(c: ChapterRow): Chapter {
  return {
    id: c.id,
    workId: c.workId,
    title: c.title,
    order: c.order,
    pages: (c.pages ?? []).map(toPageSummary),
  };
}

export function toWorkSummary(w: WorkSummaryInput): WorkSummary {
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
    kind: w.kind,
    title: w.title,
    subtitle: w.subtitle,
    author: w.author,
    year: w.year,
    coverTone: w.coverTone,
    coverUrl: w.coverUrl,
    buyLink: w.buyLink,
    status: w.status,
    tags: w.tags,
    pageCount,
    wordCount,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function toWorkDetail(w: WorkDetailInput): WorkDetail {
  return {
    ...toWorkSummary(w),
    chapters: (w.chapters ?? []).map(toChapter),
  };
}
