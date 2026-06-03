import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  blankDoc,
  countWordsInDoc,
  slugSchema,
  type ArticlesQuery,
  type CreateArticleInput,
  type TiptapDoc,
  type UpdateArticleInput,
} from '@blockpress/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toArticleDetail, toArticleSummary } from './serializers';

/** RFC-4122 textual uuid (the shape of an Article PK). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * slugify(title) — lowercased, non-alphanumerics collapsed to single hyphens,
 * trimmed, capped at 80 chars. Empty input falls back to 'article' so the slug
 * is always a valid, non-empty token.
 */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base || 'article';
}

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ArticlesQuery) {
    const articles = await this.prisma.article.findMany({
      where: { status: query.status },
      orderBy: { updatedAt: 'desc' },
    });
    return articles.map(toArticleSummary);
  }

  async create(input: CreateArticleInput, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const title = input.title ?? 'Untitled article';
    const slug = await this.uniqueSlug(slugify(title));
    const content = blankDoc();
    const article = await this.prisma.article.create({
      data: {
        slug,
        title,
        author: user?.name ?? 'Editorial',
        year: String(new Date().getFullYear()),
        coverTone: 'default',
        content: content as Prisma.InputJsonValue,
        wordCount: countWordsInDoc(content),
        createdById: userId,
      },
    });
    return toArticleSummary(article);
  }

  async detail(idOrSlug: string) {
    const article = await this.findByIdOrSlug(idOrSlug);
    if (!article) throw new NotFoundException('Article not found');
    return toArticleDetail(article);
  }

  async update(id: string, input: UpdateArticleInput) {
    await this.ensureArticle(id);

    const data: Prisma.ArticleUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.subtitle !== undefined) data.subtitle = input.subtitle;
    if (input.author !== undefined) data.author = input.author;
    if (input.year !== undefined) data.year = input.year;
    if (input.coverTone !== undefined) data.coverTone = input.coverTone;
    if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl;
    if (input.status !== undefined) data.status = input.status;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.content !== undefined) {
      data.content = input.content as Prisma.InputJsonValue;
      data.wordCount = countWordsInDoc(input.content as TiptapDoc);
    }
    if (input.slug !== undefined) {
      // A manually-supplied slug is validated and made unique (excluding self).
      const parsed = slugSchema.parse(input.slug);
      data.slug = await this.uniqueSlug(parsed, id);
    }

    const article = await this.prisma.article.update({ where: { id }, data });
    // Return the full detail (with content) — the web client parses the update
    // response with articleDetailSchema and keeps the detail-query cache warm.
    return toArticleDetail(article);
  }

  async remove(id: string) {
    await this.ensureArticle(id);
    await this.prisma.article.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Look an Article up by its uuid PK OR its unique slug. */
  private async findByIdOrSlug(idOrSlug: string) {
    if (UUID_RE.test(idOrSlug)) {
      return this.prisma.article.findUnique({ where: { id: idOrSlug } });
    }
    return this.prisma.article.findUnique({ where: { slug: idOrSlug } });
  }

  private async ensureArticle(id: string) {
    const exists = await this.prisma.article.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Article not found');
  }

  /**
   * Return `base`, or `base-2`, `base-3`, … until it is unique across articles.
   * `excludeId` lets an article keep its own slug on update without colliding with itself.
   */
  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base;
    let n = 1;
    // Bounded by the number of existing collisions; in practice one or two iterations.
    for (;;) {
      const clash = await this.prisma.article.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!clash || clash.id === excludeId) return candidate;
      n += 1;
      candidate = `${base}-${n}`;
    }
  }
}
