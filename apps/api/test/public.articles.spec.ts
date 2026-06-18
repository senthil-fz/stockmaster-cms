/**
 * PUBLIC SITE CONTRACT — published article cards for the marketing website.
 *
 * Pure unit tests (no DB / no Nest DI): PublicService is built with a hand-rolled fake
 * PrismaService, mirroring reader.articles.spec.ts. Pins the public-web contract:
 *   - only PUBLISHED articles are served (publishedVersionId != null), newest first
 *   - each card is MINIMAL — id, slug, title, coverUrl, publishedAt — never content,
 *     subtitle, author, tags or editorial state
 *   - title + coverUrl come from the frozen publish SNAPSHOT (not the live draft row)
 *   - coverUrl is null when absent (the website then renders a placeholder)
 */
import { PublicService } from '../src/public/public.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const snapshot = {
  article: { title: 'RBI holds rates', coverUrl: 'https://api.example/uploads/c.png' },
  // Extra snapshot fields the public feed must NOT leak:
  content: { type: 'doc', content: [] },
  wordCount: 800,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'rbi-holds-rates',
  // Editorial/body columns that must never reach the card:
  subtitle: 'Policy stays',
  publishedVersionId: 'v1',
  draftDirty: true,
  updatedAt: new Date('2026-06-05T00:00:00Z'),
  publishedVersion: {
    id: 'v1',
    snapshot,
    createdAt: new Date('2026-06-04T00:00:00Z'),
  },
  ...over,
});

type ArticleDelegate = Partial<Record<keyof PrismaService['article'], jest.Mock>>;
const make = (article: ArticleDelegate): PublicService =>
  new PublicService({ article } as unknown as PrismaService);

describe('PublicService — published article cards', () => {
  it('returns minimal published-only cards, newest first, with the version included', async () => {
    const findMany = jest.fn().mockResolvedValue([row()]);
    const out = await make({ findMany }).listPublishedArticles();

    expect(out).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'rbi-holds-rates',
        title: 'RBI holds rates',
        coverUrl: 'https://api.example/uploads/c.png',
        publishedAt: new Date('2026-06-04T00:00:00Z'),
      },
    ]);
    // No body / metadata / editorial fields leak through.
    for (const k of ['content', 'subtitle', 'author', 'tags', 'draftDirty', 'wordCount']) {
      expect(k in out[0]).toBe(false);
    }
    // Published-only, newest first, version included (a dropped include 500s the feed).
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ publishedVersionId: { not: null } });
    expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    expect(args.include).toEqual({ publishedVersion: true });
  });

  it('coverUrl is null when the article has no cover (website shows a placeholder)', async () => {
    const noCover = row();
    noCover.publishedVersion.snapshot = { article: { title: 'No cover', coverUrl: null } } as never;
    const out = await make({ findMany: jest.fn().mockResolvedValue([noCover]) }).listPublishedArticles();
    expect(out[0].coverUrl).toBeNull();
  });

  it('skips rows whose publishedVersion is missing instead of crashing the feed', async () => {
    const out = await make({
      findMany: jest.fn().mockResolvedValue([row(), row({ publishedVersion: null })]),
    }).listPublishedArticles();
    expect(out).toHaveLength(1);
  });
});
