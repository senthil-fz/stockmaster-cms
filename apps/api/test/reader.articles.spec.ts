/**
 * READER CONTRACT — articles list/detail served from the published snapshot.
 *
 * Pure unit tests (no live DB, no Nest DI): ReaderService is instantiated directly with a
 * hand-built fake PrismaService (mirrors auth.service.spec.ts). These pin the public reader
 * contract that the mobile app depends on:
 *   - only PUBLISHED articles are served (publishedVersionId != null)
 *   - editorial-only `hasUnpublishedChanges` is STRIPPED from every reader response
 *   - the list summary EXCLUDES `content`; the detail INCLUDES it (from the snapshot)
 *   - `wordCount` comes from the version snapshot, content/metadata are frozen at publish
 *   - getArticle resolves by id OR slug, scoped to published, and 404s when absent
 *
 * The fake row/return shapes are faithful to the real findMany/findFirst calls the impl makes.
 */
import { NotFoundException } from '@nestjs/common';
import { ReaderService } from '../src/reader/reader.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const snapshot = {
  article: {
    title: 'RBI holds rates',
    subtitle: 'Policy stays',
    author: 'Desk',
    year: '2026',
    coverTone: '#123456',
    coverUrl: 'http://x/c.png',
    tags: ['macro'],
    slug: 'rbi-holds-rates',
  },
  content: { type: 'doc', content: [] },
  wordCount: 800,
};

// A published Article row as returned by `prisma.article.find*` with `include: { publishedVersion: true }`.
const row = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'rbi-holds-rates',
  publishedVersionId: 'v1',
  draftDirty: true,
  createdAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-05T00:00:00Z'),
  publishedVersion: {
    id: 'v1',
    snapshot,
    wordCount: 800,
    createdAt: new Date('2026-06-05T00:00:00Z'),
  },
  ...over,
});

type ArticleDelegate = Partial<Record<keyof PrismaService['article'], jest.Mock>>;

function make(article: ArticleDelegate): ReaderService {
  return new ReaderService({ article } as unknown as PrismaService);
}

describe('ReaderService — articles', () => {
  it('listArticles returns published-only summaries WITHOUT hasUnpublishedChanges or content', async () => {
    const findMany = jest.fn().mockResolvedValue([row()]);
    const svc = make({ findMany });
    const out = await svc.listArticles();

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'rbi-holds-rates',
      status: 'published',
      title: 'RBI holds rates',
      subtitle: 'Policy stays',
      author: 'Desk',
      wordCount: 800,
    });
    // Editorial-only + body fields never reach the reader surface.
    expect('hasUnpublishedChanges' in out[0]).toBe(false);
    expect('content' in out[0]).toBe(false);
    // Serves published-only, newest first.
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ publishedVersionId: { not: null } });
    expect(args.orderBy).toEqual({ updatedAt: 'desc' });
  });

  it('getArticle returns detail WITH content, queried by slug, scoped to published', async () => {
    const findFirst = jest.fn().mockResolvedValue(row());
    const svc = make({ findFirst });
    const out = await svc.getArticle('rbi-holds-rates');

    expect(out).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'rbi-holds-rates',
      status: 'published',
      wordCount: 800,
    });
    expect(out.content).toEqual({ type: 'doc', content: [] });
    expect('hasUnpublishedChanges' in out).toBe(false);

    // A non-uuid token is matched by slug, scoped to published (no uuid-cast on a slug column).
    const where = findFirst.mock.calls[0][0].where;
    expect(where.publishedVersionId).toEqual({ not: null });
    expect(where.slug).toBe('rbi-holds-rates');
    expect(where.id).toBeUndefined();
  });

  it('getArticle matches by id when given a uuid-shaped token', async () => {
    const findFirst = jest.fn().mockResolvedValue(row());
    const svc = make({ findFirst });
    await svc.getArticle('11111111-1111-4111-8111-111111111111');

    const where = findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(where.slug).toBeUndefined();
    expect(where.publishedVersionId).toEqual({ not: null });
  });

  it('getArticle throws NotFound when no published article matches', async () => {
    const svc = make({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(svc.getArticle('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
