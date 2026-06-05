import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ArticleDetail,
  ArticleSnapshot,
  ArticleSummary,
  BookSnapshot,
  BookSummary,
} from '@stockmaster/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toBookSummary, toPage } from '../books/serializers';
import { toArticleDetail } from '../articles/serializers';

// The reader is served entirely from the published version: its snapshot blob (frozen
// reading structure + book metadata) plus the version's denormalized count columns.
const withPublishedVersion = {
  publishedVersion: true,
} satisfies Prisma.BookInclude;

type BookWithVersion = Prisma.BookGetPayload<{ include: typeof withPublishedVersion }>;
// Narrowed to "has a published version" — the only books the reader ever serves.
type PublishedBook = BookWithVersion & {
  publishedVersion: NonNullable<BookWithVersion['publishedVersion']>;
};

// Articles mirror the book reader: served from `publishedVersion.snapshot` (frozen article
// metadata + single TipTap doc + wordCount), never the live draft row.
const withPublishedArticleVersion = {
  publishedVersion: true,
} satisfies Prisma.ArticleInclude;

type ArticleWithVersion = Prisma.ArticleGetPayload<{
  include: typeof withPublishedArticleVersion;
}>;
// Narrowed to "has a published version" — the only articles the reader ever serves.
type PublishedArticle = ArticleWithVersion & {
  publishedVersion: NonNullable<ArticleWithVersion['publishedVersion']>;
};

/** RFC-4122 textual uuid — the shape of an Article PK (slugs never match). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only content access for the mobile app. Serves the **published snapshot**, never the
 * live draft tree: a book is publicly visible iff `publishedVersionId != null`, and its
 * content/structure/page-numbering come from `publishedVersion.snapshot` — frozen at publish
 * time and immune to in-progress draft edits.
 *
 * Pages are addressed by a 1-based **page number** that runs across the whole book (reading
 * order: chapter order, then page order). `buildBookSnapshot` already froze that ordering and
 * dropped chapters with no published page, so the numbering here is a plain sequential walk
 * over `snapshot.chapters[*].pages` — identical to the pre-snapshot live-tree walk.
 */
@Injectable()
export class ReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async listBooks() {
    const books = await this.prisma.book.findMany({
      where: { publishedVersionId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      include: withPublishedVersion,
    });
    return (books as PublishedBook[]).map((b) => this.toSummary(b));
  }

  async getBook(id: string) {
    const book = await this.prisma.book.findFirst({
      where: { id, publishedVersionId: { not: null } },
      include: withPublishedVersion,
    });
    if (!book?.publishedVersion) throw new NotFoundException('Book not found');

    const summary = this.toSummary(book as PublishedBook);
    const snapshot = this.snapshotOf(book as PublishedBook);
    let pageNumber = 0;
    const chapters = snapshot.chapters.map((c) => ({
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
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, publishedVersionId: { not: null } },
      include: withPublishedVersion,
    });
    if (!book?.publishedVersion) throw new NotFoundException('Book not found');

    const snapshot = this.snapshotOf(book as PublishedBook);
    const located = this.locatePage(snapshot, pageNumber);
    if (!located) throw new NotFoundException('Page not found');
    const { chapterId, page, totalPages } = located;

    // The snapshot preserves the real live Page.id, so read-tracking keeps keying off it.
    this.trackPageRead(bookId, page.id, client);
    return {
      // The snapshot page carries only the reading subset; rebuild the wire Page shape the
      // app consumes. status is always 'published' (snapshots hold only published pages) and
      // updatedAt is the version's publish time (no per-page timestamp is frozen).
      ...toPage({
        id: page.id,
        chapterId,
        title: page.title,
        status: 'published',
        order: page.order,
        wordCount: page.wordCount,
        updatedAt: book.publishedVersion.createdAt,
        content: page.content,
      }),
      pageNumber,
      totalPages,
      // Direct page numbers for the reader's pager; null at the first/last page.
      prevPage: pageNumber > 1 ? pageNumber - 1 : null,
      nextPage: pageNumber < totalPages ? pageNumber + 1 : null,
    };
  }

  // ─── Articles ───────────────────────────────────────────────────────────────────
  // Single-page works (one TipTap doc, no chapter tree). Same published-snapshot contract
  // as books: visible iff `publishedVersionId != null`, content/metadata frozen at publish.

  async listArticles() {
    const articles = await this.prisma.article.findMany({
      where: { publishedVersionId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      include: withPublishedArticleVersion,
    });
    return (articles as PublishedArticle[]).map((a) => this.articleSummary(a));
  }

  /** Resolve a published article by id OR slug. Returns the full detail (incl. content). */
  async getArticle(idOrSlug: string) {
    // Article ids are postgres uuids — querying `id = <slug>` would throw a uuid-cast error,
    // so only match the id column when the token is uuid-shaped; otherwise match the slug.
    const identity: Prisma.ArticleWhereInput = UUID_RE.test(idOrSlug)
      ? { id: idOrSlug }
      : { slug: idOrSlug };
    const article = await this.prisma.article.findFirst({
      where: { ...identity, publishedVersionId: { not: null } },
      include: withPublishedArticleVersion,
    });
    if (!article?.publishedVersion) throw new NotFoundException('Article not found');
    return this.articleDetail(article as PublishedArticle);
  }

  /** Reader detail: snapshot content + metadata + version wordCount, sans editorial state. */
  private articleDetail(article: PublishedArticle): Omit<ArticleDetail, 'hasUnpublishedChanges'> {
    const snap = this.articleSnapshotOf(article);
    // `hasUnpublishedChanges` is editorial state — the reader contract strips it (mirror books).
    const { hasUnpublishedChanges: _omit, ...detail } = toArticleDetail({
      // Identity/state from the live row; everything else frozen in the snapshot.
      id: article.id,
      // slug is a routing key (resolved against the live `Article.slug` column), not display
      // metadata — serve the LIVE value so the list's advertised slug always re-fetches and the
      // detail response's slug matches the requested token. The frozen snapshot slug can drift
      // after a post-publish slug edit (update() repoints Article.slug without republishing).
      slug: article.slug,
      title: snap.article.title,
      subtitle: snap.article.subtitle,
      author: snap.article.author,
      year: snap.article.year,
      coverTone: snap.article.coverTone,
      coverUrl: snap.article.coverUrl,
      tags: snap.article.tags,
      publishedVersionId: article.publishedVersionId,
      draftDirty: article.draftDirty,
      wordCount: snap.wordCount,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      content: snap.content,
    });
    return detail;
  }

  /** Reader list summary: the detail minus the content body (covers + meta only). */
  private articleSummary(article: PublishedArticle): Omit<ArticleSummary, 'hasUnpublishedChanges'> {
    const { content: _content, ...summary } = this.articleDetail(article);
    return summary;
  }

  private articleSnapshotOf(article: PublishedArticle): ArticleSnapshot {
    return article.publishedVersion.snapshot as unknown as ArticleSnapshot;
  }

  /**
   * Walk the snapshot's frozen reading order to the Nth page (1-based), tracking which
   * chapter owns it (the app's Page shape needs chapterId) and the book-global total.
   */
  private locatePage(snapshot: BookSnapshot, pageNumber: number) {
    let totalPages = 0;
    for (const c of snapshot.chapters) totalPages += c.pages.length;

    let counter = 0;
    for (const c of snapshot.chapters) {
      for (const page of c.pages) {
        if (++counter === pageNumber) return { chapterId: c.id, page, totalPages };
      }
    }
    return null;
  }

  /** Build the reader summary from the snapshot metadata + the version's count columns. */
  private toSummary(book: PublishedBook): Omit<BookSummary, 'hasUnpublishedChanges'> {
    const meta = this.snapshotOf(book).book;
    const {
      // `hasUnpublishedChanges` is editorial state — the reader contract is that drafts and
      // editorial-only fields never reach this surface, so strip it from the public response.
      hasUnpublishedChanges: _omit,
      ...summary
    } = toBookSummary({
      // Snapshot metadata is frozen at publish time, so in-progress draft edits never leak.
      ...book,
      ...meta,
      // Identity/state fields come from the live row, not the snapshot.
      id: book.id,
      publishedVersionId: book.publishedVersionId,
      draftDirty: book.draftDirty,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      chapters: [], // counts are overridden from the version columns below
    });
    return {
      ...summary,
      pageCount: book.publishedVersion.pageCount,
      wordCount: book.publishedVersion.wordCount,
    };
  }

  private snapshotOf(book: PublishedBook): BookSnapshot {
    return book.publishedVersion.snapshot as unknown as BookSnapshot;
  }

  /**
   * Record an anonymous page read for analytics (mirrors the editor's ReadTrackingInterceptor,
   * which can't key off this nested route). Fire-and-forget — never blocks or breaks a read.
   */
  private trackPageRead(bookId: string, pageId: string, client: string | null): void {
    const tag = (client ?? '').toString().trim().toLowerCase().slice(0, 40) || 'unknown';
    void this.prisma.readEvent
      .create({ data: { bookId, pageId, userId: null, client: tag, kind: 'page_read' } })
      .catch(() => undefined);
  }
}
