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

// Covers published before the laabam.in -> stockmasternagaraj.com rename have the old host
// frozen in their snapshot. That host is gone (DNS dead), but the image file still lives at
// the same /uploads path on the current host — so re-base legacy hosts onto PUBLIC_API_URL.
const LEGACY_UPLOAD_HOSTS = new Set(['api.laabam.in', 'app.laabam.in', 'laabam.in']);
const PUBLIC_BASE = (process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

function normalizeCoverUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (LEGACY_UPLOAD_HOSTS.has(u.hostname)) return `${PUBLIC_BASE}${u.pathname}${u.search}`;
    return url;
  } catch {
    return url; // not an absolute URL — leave as-is
  }
}

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
          coverUrl: normalizeCoverUrl(snap.article.coverUrl ?? null),
          publishedAt: r.publishedVersion.createdAt,
        };
      });
  }
}
