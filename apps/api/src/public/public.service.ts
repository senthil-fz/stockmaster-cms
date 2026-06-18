import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Only published articles are ever served (publishedVersionId != null), same invariant as
// the mobile reader. Title + cover come from the frozen publish snapshot, so the website
// shows exactly what was published, not in-progress draft edits.
const withPublishedVersion = { publishedVersion: true } satisfies Prisma.ArticleInclude;
type ArticleRow = Prisma.ArticleGetPayload<{ include: typeof withPublishedVersion }>;

// Minimal shape the just-the-snapshot needs (title + optional cover).
type ArticleSnapshot = { article: { title: string; coverUrl: string | null } };

/** A published-article card for the public marketing site: title + cover only. */
export interface PublicArticleCard {
  id: string;
  slug: string;
  title: string;
  /** Absolute cover image URL, or null when the article has no cover (site shows a placeholder). */
  coverUrl: string | null;
  publishedAt: Date;
}

/**
 * Unauthenticated, read-only feed for the public website (www.stockmasternagaraj.com).
 *
 * Distinct from ReaderService: that surface is the HMAC-signed mobile contract and returns
 * full article metadata + content. This one is callable from a static site with no secret,
 * so it returns ONLY what a teaser card needs (title + cover image), nothing else.
 */
@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublishedArticles(): Promise<PublicArticleCard[]> {
    const rows = await this.prisma.article.findMany({
      where: { publishedVersionId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      include: withPublishedVersion,
    });

    return rows
      // A dropped `include` would make publishedVersion undefined; skip rather than 500 the feed.
      .filter(
        (r): r is ArticleRow & { publishedVersion: NonNullable<ArticleRow['publishedVersion']> } =>
          r.publishedVersion != null,
      )
      .map((r) => {
        const snap = r.publishedVersion.snapshot as unknown as ArticleSnapshot;
        return {
          id: r.id,
          // slug is the live routing key (mirrors the reader contract); title/cover are frozen.
          slug: r.slug,
          title: snap.article.title,
          coverUrl: snap.article.coverUrl ?? null,
          publishedAt: r.publishedVersion.createdAt,
        };
      });
  }
}
