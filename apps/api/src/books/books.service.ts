import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  blankDoc,
  countWordsInDoc,
  slugSchema,
  type BooksQuery,
  type CreateBookInput,
  type CreateChapterInput,
  type UpdateBookInput,
  type UpdateChapterInput,
} from '@stockmaster/shared';
import { PrismaService } from '../prisma/prisma.service';
import { newBookSkeleton } from './skeletons';
import { toBookDetail, toBookSummary, toChapter } from './serializers';

/** slugify(title) — lowercased, non-alphanumerics → single hyphens, trimmed, ≤80 chars. */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base || 'book';
}

// Reusable include shapes.
const summaryInclude = {
  chapters: { include: { pages: { select: { id: true, wordCount: true } } } },
} satisfies Prisma.BookInclude;

const detailInclude = {
  chapters: {
    orderBy: { order: 'asc' },
    include: { pages: { orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.BookInclude;

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: BooksQuery) {
    const books = await this.prisma.book.findMany({
      where: { status: query.status },
      orderBy: { updatedAt: 'desc' },
      include: summaryInclude,
    });
    return books.map(toBookSummary);
  }

  async create(input: CreateBookInput, userId: string) {
    const skeleton = newBookSkeleton(input.title);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const slug = await this.uniqueSlug(slugify(skeleton.title));
    const book = await this.prisma.book.create({
      data: {
        slug,
        title: skeleton.title,
        author: user?.name ?? 'Editorial',
        year: String(new Date().getFullYear()),
        coverTone: 'default',
        createdById: userId,
        chapters: {
          create: skeleton.chapters.map((ch, ci) => ({
            title: ch.title,
            order: ci,
            pages: {
              create: ch.pages.map((pg, pi) => ({
                title: pg.title,
                order: pi,
                content: pg.content as Prisma.InputJsonValue,
                wordCount: countWordsInDoc(pg.content),
              })),
            },
          })),
        },
      },
      include: summaryInclude,
    });
    return toBookSummary(book);
  }

  async detail(id: string) {
    const book = await this.prisma.book.findUnique({ where: { id }, include: detailInclude });
    if (!book) throw new NotFoundException('Book not found');
    return toBookDetail(book);
  }

  async update(id: string, input: UpdateBookInput) {
    await this.ensureBook(id);
    const data: Prisma.BookUpdateInput = {
      title: input.title,
      subtitle: input.subtitle,
      author: input.author,
      year: input.year,
      coverTone: input.coverTone,
      coverUrl: input.coverUrl,
      buyLink: input.buyLink,
      status: input.status,
      tags: input.tags,
    };
    if (input.slug !== undefined) {
      // A manually-supplied slug is validated and made unique (excluding self).
      data.slug = await this.uniqueSlug(slugSchema.parse(input.slug), id);
    }
    const book = await this.prisma.book.update({
      where: { id },
      data,
      include: summaryInclude,
    });
    return toBookSummary(book);
  }

  async remove(id: string) {
    await this.ensureBook(id);
    await this.prisma.book.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Chapters ──────────────────────────────────────────────────────────────

  async addChapter(bookId: string, input: CreateChapterInput) {
    await this.ensureBook(bookId);
    // Append after the current highest order — `count()` collides after a non-tail delete.
    const agg = await this.prisma.chapter.aggregate({ where: { bookId }, _max: { order: true } });
    const order = (agg._max.order ?? -1) + 1;
    const chapter = await this.prisma.chapter.create({
      data: {
        bookId,
        title: input.title ?? `Chapter ${order + 1}`,
        order,
        pages: {
          create: [
            {
              title: 'New page',
              order: 0,
              content: blankDoc() as Prisma.InputJsonValue,
              wordCount: 0,
            },
          ],
        },
      },
      include: { pages: { orderBy: { order: 'asc' } } },
    });
    await this.touchBook(bookId);
    return toChapter(chapter);
  }

  async updateChapter(id: string, input: UpdateChapterInput) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id } });
    if (!chapter) throw new NotFoundException('Chapter not found');
    const updated = await this.prisma.chapter.update({
      where: { id },
      data: { title: input.title, order: input.order },
      include: { pages: { orderBy: { order: 'asc' } } },
    });
    await this.touchBook(chapter.bookId);
    return toChapter(updated);
  }

  async removeChapter(id: string) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id } });
    if (!chapter) throw new NotFoundException('Chapter not found');
    await this.prisma.chapter.delete({ where: { id } });
    await this.touchBook(chapter.bookId);
    return { ok: true };
  }

  private async ensureBook(id: string) {
    const exists = await this.prisma.book.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Book not found');
  }

  /**
   * Return `base`, or `base-2`, `base-3`, … until it is unique across books.
   * `excludeId` lets a book keep its own slug on update without colliding with itself.
   */
  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base;
    let n = 1;
    for (;;) {
      const clash = await this.prisma.book.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!clash || clash.id === excludeId) return candidate;
      n += 1;
      candidate = `${base}-${n}`;
    }
  }

  private async touchBook(bookId: string) {
    await this.prisma.book.update({ where: { id: bookId }, data: { updatedAt: new Date() } });
  }
}
