import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  blankDoc,
  countWordsInDoc,
  type CreatePageInput,
  type TiptapDoc,
  type UpdatePageInput,
} from '@stockmaster/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toPage } from '../books/serializers';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: string) {
    const page = await this.prisma.page.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Page not found');
    return toPage(page);
  }

  async addPage(chapterId: string, input: CreatePageInput) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) throw new NotFoundException('Chapter not found');
    // Append after the current highest order — `count()` collides after a non-tail delete.
    const agg = await this.prisma.page.aggregate({ where: { chapterId }, _max: { order: true } });
    const order = (agg._max.order ?? -1) + 1;
    const content = blankDoc();
    const page = await this.prisma.page.create({
      data: {
        chapterId,
        title: input.title ?? 'New page',
        order,
        content: content as Prisma.InputJsonValue,
        wordCount: countWordsInDoc(content),
      },
    });
    await this.touchBook(chapter.bookId);
    return toPage(page);
  }

  async update(id: string, input: UpdatePageInput) {
    const existing = await this.prisma.page.findUnique({
      where: { id },
      include: { chapter: { select: { bookId: true } } },
    });
    if (!existing) throw new NotFoundException('Page not found');

    const data: Prisma.PageUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.status !== undefined) data.status = input.status;
    if (input.order !== undefined) data.order = input.order;
    if (input.content !== undefined) {
      data.content = input.content as Prisma.InputJsonValue;
      data.wordCount = countWordsInDoc(input.content as TiptapDoc);
    }

    const page = await this.prisma.page.update({ where: { id }, data });
    await this.touchBook(existing.chapter.bookId);
    return toPage(page);
  }

  async remove(id: string) {
    const existing = await this.prisma.page.findUnique({
      where: { id },
      include: { chapter: { select: { bookId: true } } },
    });
    if (!existing) throw new NotFoundException('Page not found');
    await this.prisma.page.delete({ where: { id } });
    await this.touchBook(existing.chapter.bookId);
    return { ok: true };
  }

  /**
   * Bump `updatedAt` and mark the draft dirty: every page mutation (create, update,
   * delete) diverges the draft from the published snapshot, so it must flag
   * `draftDirty` for the "unpublished changes" indicator. Publishing clears the flag.
   */
  private async touchBook(bookId: string) {
    await this.prisma.book.update({
      where: { id: bookId },
      data: { updatedAt: new Date(), draftDirty: true },
    });
  }
}
