/**
 * PUBLIC SITE CONTRACT — published article cards for the marketing website.
 *
 * Pure unit tests (no DB / no Nest DI): PublicService is built with a hand-rolled fake
 * PrismaService, mirroring reader.articles.spec.ts. Pins the public-web contract:
 *   - only PUBLISHED articles are served (publishedVersionId != null), newest first
 *   - each card carries CARD metadata — id, slug, title, excerpt, coverUrl, author, tag,
 *     readingMinutes, publishedAt — derived from the frozen publish SNAPSHOT
 *   - excerpt = subtitle, falling back to a short teaser from the body; the FULL body is
 *     never serialized out, and no editorial/draft state ever leaks
 *   - coverUrl is absolute on the current API host (stored domain-free, re-based on read)
 */
import { PublicService } from '../src/public/public.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const snapshot = {
  article: {
    title: 'RBI holds rates',
    subtitle: 'Policy stays steady as inflation cools',
    author: 'Nagaraj B.',
    tags: ['Markets', 'Policy'],
    coverUrl: '/uploads/2026/c.png',
  },
  // The body is present in the snapshot but must NOT be serialized out wholesale:
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] },
  wordCount: 800,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'rbi-holds-rates',
  // Editorial/body columns that must never reach the card:
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
  it('returns published-only card metadata, newest first, with the version included', async () => {
    const findMany = jest.fn().mockResolvedValue([row()]);
    const out = await make({ findMany }).listPublishedArticles();

    expect(out).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'rbi-holds-rates',
        title: 'RBI holds rates',
        excerpt: 'Policy stays steady as inflation cools', // subtitle wins over body teaser
        coverUrl: 'http://localhost:3001/uploads/2026/c.png', // PUBLIC_API_URL unset -> localhost
        author: 'Nagaraj B.',
        tag: 'Markets', // first tag is the category label
        readingMinutes: 4, // 800 words / 200 wpm
        publishedAt: new Date('2026-06-04T00:00:00Z'),
      },
    ]);
    // The full body and editorial fields never leak through.
    for (const k of ['content', 'subtitle', 'tags', 'draftDirty', 'wordCount']) {
      expect(k in out[0]).toBe(false);
    }
    // Published-only, newest first, version included (a dropped include 500s the feed).
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ publishedVersionId: { not: null } });
    expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    expect(args.include).toEqual({ publishedVersion: true });
  });

  it('falls back to a trimmed body teaser when the subtitle is empty', async () => {
    const r = row();
    r.publishedVersion.snapshot = {
      article: { title: 'No subtitle', subtitle: '', author: '', tags: [], coverUrl: null },
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text:
                  'The Nifty has whipsawed through a volatile fortnight as global rate fears collide ' +
                  'with resilient domestic earnings, leaving retail investors unsure whether to add or trim.',
              },
            ],
          },
        ],
      },
      wordCount: 30,
    } as never;
    const out = await make({ findMany: jest.fn().mockResolvedValue([r]) }).listPublishedArticles();
    expect(out[0].excerpt).toMatch(/^The Nifty has whipsawed/);
    expect(out[0].excerpt!.endsWith('…')).toBe(true);
    expect(out[0].excerpt!.length).toBeLessThanOrEqual(165);
    // author/tag degrade to null when unset; no cover -> null (site shows a placeholder).
    expect(out[0].author).toBeNull();
    expect(out[0].tag).toBeNull();
    expect(out[0].coverUrl).toBeNull();
  });

  it('excerpt is null only when both subtitle and body are empty', async () => {
    const r = row();
    r.publishedVersion.snapshot = {
      article: { title: 'Bare', subtitle: '', coverUrl: null },
      content: { type: 'doc', content: [] },
      wordCount: 0,
    } as never;
    const out = await make({ findMany: jest.fn().mockResolvedValue([r]) }).listPublishedArticles();
    expect(out[0].excerpt).toBeNull();
    expect(out[0].readingMinutes).toBe(1); // never below 1
  });

  it('re-bases legacy laabam.in cover hosts onto the current API host', async () => {
    const legacy = row();
    legacy.publishedVersion.snapshot = {
      ...snapshot,
      article: { ...snapshot.article, coverUrl: 'https://api.laabam.in/uploads/2026/x.jpg' },
    } as never;
    const out = await make({ findMany: jest.fn().mockResolvedValue([legacy]) }).listPublishedArticles();
    // PUBLIC_API_URL is unset in tests -> defaults to localhost:3001; only the host is rewritten.
    expect(out[0].coverUrl).toBe('http://localhost:3001/uploads/2026/x.jpg');
  });

  it('skips rows whose publishedVersion is missing instead of crashing the feed', async () => {
    const out = await make({
      findMany: jest.fn().mockResolvedValue([row(), row({ publishedVersion: null })]),
    }).listPublishedArticles();
    expect(out).toHaveLength(1);
  });
});
