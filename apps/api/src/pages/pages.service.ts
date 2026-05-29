import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  blankDoc,
  countWordsInDoc,
  type CreatePageInput,
  type TiptapDoc,
  type UpdatePageInput,
} from '@blockpress/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toPage } from '../works/serializers';

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
    const count = await this.prisma.page.count({ where: { chapterId } });
    const content = blankDoc();
    const page = await this.prisma.page.create({
      data: {
        chapterId,
        title: input.title ?? 'New page',
        order: count,
        content: content as Prisma.InputJsonValue,
        wordCount: countWordsInDoc(content),
      },
    });
    await this.touchWork(chapter.workId);
    return toPage(page);
  }

  async update(id: string, input: UpdatePageInput) {
    const existing = await this.prisma.page.findUnique({
      where: { id },
      include: { chapter: { select: { workId: true } } },
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
    await this.touchWork(existing.chapter.workId);
    return toPage(page);
  }

  async remove(id: string) {
    const existing = await this.prisma.page.findUnique({
      where: { id },
      include: { chapter: { select: { workId: true } } },
    });
    if (!existing) throw new NotFoundException('Page not found');
    await this.prisma.page.delete({ where: { id } });
    await this.touchWork(existing.chapter.workId);
    return { ok: true };
  }

  private async touchWork(workId: string) {
    await this.prisma.work.update({ where: { id: workId }, data: { updatedAt: new Date() } });
  }
}
