import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  blankDoc,
  countWordsInDoc,
  type CreateChapterInput,
  type CreateWorkInput,
  type UpdateChapterInput,
  type UpdateWorkInput,
  type WorksQuery,
} from '@blockpress/shared';
import { PrismaService } from '../prisma/prisma.service';
import { newWorkSkeleton } from './skeletons';
import { toChapter, toWorkDetail, toWorkSummary } from './serializers';

// Reusable include shapes.
const summaryInclude = {
  chapters: { include: { pages: { select: { id: true, wordCount: true } } } },
} satisfies Prisma.WorkInclude;

const detailInclude = {
  chapters: {
    orderBy: { order: 'asc' },
    include: { pages: { orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.WorkInclude;

@Injectable()
export class WorksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: WorksQuery) {
    const works = await this.prisma.work.findMany({
      where: { kind: query.kind, status: query.status },
      orderBy: { updatedAt: 'desc' },
      include: summaryInclude,
    });
    return works.map(toWorkSummary);
  }

  async create(input: CreateWorkInput, userId: string) {
    const skeleton = newWorkSkeleton(input.kind, input.title);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const work = await this.prisma.work.create({
      data: {
        kind: input.kind,
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
    return toWorkSummary(work);
  }

  async detail(id: string) {
    const work = await this.prisma.work.findUnique({ where: { id }, include: detailInclude });
    if (!work) throw new NotFoundException('Work not found');
    return toWorkDetail(work);
  }

  async update(id: string, input: UpdateWorkInput) {
    await this.ensureWork(id);
    const work = await this.prisma.work.update({
      where: { id },
      data: {
        title: input.title,
        subtitle: input.subtitle,
        author: input.author,
        year: input.year,
        coverTone: input.coverTone,
        coverUrl: input.coverUrl,
        buyLink: input.buyLink,
        status: input.status,
        tags: input.tags,
      },
      include: summaryInclude,
    });
    return toWorkSummary(work);
  }

  async remove(id: string) {
    await this.ensureWork(id);
    await this.prisma.work.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Chapters ──────────────────────────────────────────────────────────────

  async addChapter(workId: string, input: CreateChapterInput) {
    await this.ensureWork(workId);
    // Append after the current highest order — `count()` collides after a non-tail delete.
    const agg = await this.prisma.chapter.aggregate({ where: { workId }, _max: { order: true } });
    const order = (agg._max.order ?? -1) + 1;
    const chapter = await this.prisma.chapter.create({
      data: {
        workId,
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
    await this.touchWork(workId);
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
    await this.touchWork(chapter.workId);
    return toChapter(updated);
  }

  async removeChapter(id: string) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id } });
    if (!chapter) throw new NotFoundException('Chapter not found');
    await this.prisma.chapter.delete({ where: { id } });
    await this.touchWork(chapter.workId);
    return { ok: true };
  }

  private async ensureWork(id: string) {
    const exists = await this.prisma.work.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Work not found');
  }

  private async touchWork(workId: string) {
    await this.prisma.work.update({ where: { id: workId }, data: { updatedAt: new Date() } });
  }
}
