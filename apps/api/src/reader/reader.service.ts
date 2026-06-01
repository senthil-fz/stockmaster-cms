import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPage, toWorkSummary } from '../works/serializers';

const PUBLISHED = 'published' as const;

// Summary counts only published pages, so page/word counts match what a reader sees.
const publishedSummaryInclude = {
  chapters: {
    include: { pages: { where: { status: PUBLISHED }, select: { id: true, wordCount: true } } },
  },
} satisfies Prisma.WorkInclude;

// Detail/page access need the published pages in reading order (chapter, then page).
const publishedDetailInclude = {
  chapters: {
    orderBy: { order: 'asc' },
    include: { pages: { where: { status: PUBLISHED }, orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.WorkInclude;

type WorkWithPages = Prisma.WorkGetPayload<{ include: typeof publishedDetailInclude }>;

/**
 * Read-only content access for the mobile app. Every query is scoped to
 * `status: 'published'` at the work AND page level — drafts and editorial-only
 * fields are never reachable through this surface.
 *
 * Pages are addressed by a 1-based **page number** that runs across the whole book
 * (reading order: chapter order, then page order, skipping chapters with no published
 * pages). The same numbering is exposed on every page in the book detail so the app can
 * map a table-of-contents entry to `/v1/books/:id/pages/:pageno`.
 */
@Injectable()
export class ReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async listBooks() {
    const works = await this.prisma.work.findMany({
      where: { status: PUBLISHED },
      orderBy: { updatedAt: 'desc' },
      include: publishedSummaryInclude,
    });
    return works.map(toWorkSummary);
  }

  async getBook(id: string) {
    const work = await this.prisma.work.findFirst({
      where: { id, status: PUBLISHED },
      include: publishedDetailInclude,
    });
    if (!work) throw new NotFoundException('Book not found');

    const summary = toWorkSummary(work);
    let pageNumber = 0;
    const chapters = this.nonEmptyChapters(work).map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      pages: c.pages.map((p) => ({
        id: p.id,
        title: p.title,
        wordCount: p.wordCount,
        pageNumber: ++pageNumber, // 1-based, book-global
      })),
    }));
    return { ...summary, chapters };
  }

  /** Fetch the Nth published page (1-based) of a published book, with its content. */
  async getBookPage(bookId: string, pageNumber: number, client: string | null) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new NotFoundException('Page not found');
    }
    const work = await this.prisma.work.findFirst({
      where: { id: bookId, status: PUBLISHED },
      include: publishedDetailInclude,
    });
    if (!work) throw new NotFoundException('Book not found');

    const pages = this.nonEmptyChapters(work).flatMap((c) => c.pages);
    const page = pages[pageNumber - 1];
    if (!page) throw new NotFoundException('Page not found');

    this.trackPageRead(bookId, page.id, client);
    return {
      ...toPage(page),
      pageNumber,
      totalPages: pages.length,
      // Direct page numbers for the reader's pager; null at the first/last page.
      prevPage: pageNumber > 1 ? pageNumber - 1 : null,
      nextPage: pageNumber < pages.length ? pageNumber + 1 : null,
    };
  }

  private nonEmptyChapters(work: WorkWithPages) {
    return work.chapters.filter((c) => c.pages.length > 0);
  }

  /**
   * Record an anonymous page read for analytics (mirrors the editor's ReadTrackingInterceptor,
   * which can't key off this nested route). Fire-and-forget — never blocks or breaks a read.
   */
  private trackPageRead(workId: string, pageId: string, client: string | null): void {
    const tag = (client ?? '').toString().trim().toLowerCase().slice(0, 40) || 'unknown';
    void this.prisma.readEvent
      .create({ data: { workId, pageId, userId: null, client: tag, kind: 'page_read' } })
      .catch(() => undefined);
  }
}
