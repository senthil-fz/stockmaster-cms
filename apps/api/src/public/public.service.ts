import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicCoverUrl } from '../common/media/cover-url';

// Only published articles are ever served (publishedVersionId != null), same invariant as
// the mobile reader. Everything shown comes from the frozen publish snapshot, so the website
// shows exactly what was published, not in-progress draft edits.
const withPublishedVersion = { publishedVersion: true } satisfies Prisma.ArticleInclude;
type ArticleRow = Prisma.ArticleGetPayload<{ include: typeof withPublishedVersion }>;

// The slice of the snapshot a teaser card reads: headline metadata + the body (for the
// excerpt fallback) + wordCount (for read time). The full body is never serialized out —
// only a short, plain-text teaser derived from it.
type ArticleSnapshot = {
  article: {
    title: string;
    subtitle?: string | null;
    author?: string | null;
    coverUrl: string | null;
    tags?: string[] | null;
  };
  content?: unknown;
  wordCount?: number;
};

// Roughly average adult reading speed; good enough for an "N min read" badge.
const WORDS_PER_MINUTE = 200;
const EXCERPT_MAX = 160;

function readingMinutes(wordCount: number | undefined): number {
  return Math.max(1, Math.round((wordCount ?? 0) / WORDS_PER_MINUTE));
}

// Flatten a TipTap/ProseMirror doc to plain text (depth-first over `text` nodes), inserting
// a space at block boundaries so words don't run together. Used only to derive a teaser.
function plainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  const inner = Array.isArray(n.content) ? n.content.map(plainText).join('') : '';
  // Block-level nodes get a trailing space so adjacent paragraphs stay separated.
  return n.type && n.type !== 'text' ? `${inner} ` : inner;
}

/** Short teaser: subtitle if set, else the first ~160 chars of the body, trimmed at a word. */
function buildExcerpt(snap: ArticleSnapshot): string | null {
  const subtitle = snap.article.subtitle?.trim();
  if (subtitle) return subtitle;

  const body = plainText(snap.content).replace(/\s+/g, ' ').trim();
  if (!body) return null;
  if (body.length <= EXCERPT_MAX) return body;
  const cut = body.slice(0, EXCERPT_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** A published-article card for the public marketing site. */
export interface PublicArticleCard {
  id: string;
  slug: string;
  title: string;
  /** Subtitle, or a short teaser derived from the body; null only when both are empty. */
  excerpt: string | null;
  /** Absolute cover image URL, or null when the article has no cover (site shows a placeholder). */
  coverUrl: string | null;
  /** Display author, or null when none was set. */
  author: string | null;
  /** First tag, used as a category label; null when untagged. */
  tag: string | null;
  /** Estimated read time in whole minutes (>= 1). */
  readingMinutes: number;
  publishedAt: Date;
}

/**
 * Unauthenticated, read-only feed for the public website (www.stockmasternagaraj.com).
 *
 * Distinct from ReaderService: that surface is the HMAC-signed mobile contract and returns
 * the full article body. This one is callable from a static site with no secret, so it
 * returns only what a teaser CARD needs — never the full content, draft state, or any
 * editorial-only fields.
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
          // slug is the live routing key (mirrors the reader contract); the rest is frozen.
          slug: r.slug,
          title: snap.article.title,
          excerpt: buildExcerpt(snap),
          coverUrl: toPublicCoverUrl(snap.article.coverUrl ?? null),
          author: snap.article.author?.trim() || null,
          tag: snap.article.tags?.[0]?.trim() || null,
          readingMinutes: readingMinutes(snap.wordCount),
          publishedAt: r.publishedVersion.createdAt,
        };
      });
  }
}
