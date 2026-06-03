import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BookStat,
  BookStatDetail,
  BookStatsResponse,
  StatsQuery,
} from '@blockpress/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read analytics derived from the append-only ReadEvent log. The heavier aggregations
 * (count-distinct per group, completion, drop-off) are parameterized $queryRaw — all
 * user input goes through Prisma.sql placeholders, never string interpolation.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async books(q: StatsQuery): Promise<BookStatsResponse> {
    const { range, client, clientPrefix } = this.conds(q);
    const filter = this.andFrag([...range, ...client]);

    const agg = await this.prisma.$queryRaw<
      { bookid: string; reads: number; opens: number; uniquereaders: number; lastreadat: Date | null }[]
    >(Prisma.sql`
      SELECT re."bookId" AS bookid,
             COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads,
             COUNT(*) FILTER (WHERE re.kind = 'book_open')::int AS opens,
             COUNT(DISTINCT re."userId")::int AS uniquereaders,
             MAX(re."createdAt") AS lastreadat
      FROM "ReadEvent" re
      WHERE TRUE ${filter}
      GROUP BY re."bookId"
    `);

    const out: BookStatsResponse = {
      client: clientPrefix,
      from: q.from ?? null,
      to: q.to ?? null,
      totals: { reads: 0, uniqueReaders: 0, books: 0 },
      books: [],
    };
    if (agg.length === 0) return out;

    const bookIds = agg.map((a) => a.bookid);
    const [completion, books_, totalReaders] = await Promise.all([
      this.completion([...range, ...client]),
      this.prisma.book.findMany({
        where: { id: { in: bookIds } },
        select: { id: true, title: true },
      }),
      this.prisma.$queryRaw<{ c: number }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT re."userId")::int AS c FROM "ReadEvent" re WHERE TRUE ${filter}
      `),
    ]);
    const meta = new Map(books_.map((w) => [w.id, w]));

    const books: BookStat[] = agg
      .filter((a) => meta.has(a.bookid))
      .map((a) => {
        const m = meta.get(a.bookid)!;
        return {
          bookId: a.bookid,
          title: m.title,
          reads: a.reads,
          opens: a.opens,
          uniqueReaders: a.uniquereaders,
          avgCompletionPct: completion.get(a.bookid) ?? 0,
          lastReadAt: a.lastreadat ? a.lastreadat.toISOString() : null,
        };
      })
      .sort((x, y) => y.reads - x.reads || y.opens - x.opens);

    out.books = books;
    out.totals = {
      reads: books.reduce((n, b) => n + b.reads, 0),
      uniqueReaders: totalReaders[0]?.c ?? 0,
      books: books.length,
    };
    return out;
  }

  async bookDetail(bookId: string, q: StatsQuery): Promise<BookStatDetail> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true },
    });
    if (!book) throw new NotFoundException('Book not found');

    const { range, client } = this.conds(q);
    const filter = this.andFrag([...range, ...client]);

    const [pc, agg, completion, trend, dropoff, byClient] = await Promise.all([
      this.prisma.$queryRaw<{ cnt: number }[]>(Prisma.sql`
        SELECT COUNT(p.id)::int AS cnt FROM "Page" p
        JOIN "Chapter" c ON p."chapterId" = c.id WHERE c."bookId" = ${bookId}
      `),
      this.prisma.$queryRaw<
        { reads: number; opens: number; uniquereaders: number; lastreadat: Date | null }[]
      >(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads,
               COUNT(*) FILTER (WHERE re.kind = 'book_open')::int AS opens,
               COUNT(DISTINCT re."userId")::int AS uniquereaders,
               MAX(re."createdAt") AS lastreadat
        FROM "ReadEvent" re WHERE re."bookId" = ${bookId} ${filter}
      `),
      this.completion([Prisma.sql`re."bookId" = ${bookId}`, ...range, ...client]),
      this.prisma.$queryRaw<{ date: string; reads: number }[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', re."createdAt"), 'YYYY-MM-DD') AS date,
               COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads
        FROM "ReadEvent" re WHERE re."bookId" = ${bookId} ${filter}
        GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<{ position: number; readers: number }[]>(Prisma.sql`
        WITH pos AS (
          SELECT p.id AS pageid,
                 ROW_NUMBER() OVER (ORDER BY c."order", c.id, p."order", p.id) AS position
          FROM "Page" p JOIN "Chapter" c ON p."chapterId" = c.id WHERE c."bookId" = ${bookId}
        )
        SELECT pos.position::int AS position, COUNT(DISTINCT re."userId")::int AS readers
        FROM "ReadEvent" re JOIN pos ON pos.pageid = re."pageId"
        WHERE re."bookId" = ${bookId} AND re.kind = 'page_read' AND re."userId" IS NOT NULL ${filter}
        GROUP BY pos.position ORDER BY pos.position
      `),
      // client split ignores the client filter on purpose — show every client's share.
      this.prisma.$queryRaw<{ client: string; reads: number }[]>(Prisma.sql`
        SELECT re."client" AS client, COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads
        FROM "ReadEvent" re WHERE re."bookId" = ${bookId} ${this.andFrag(range)}
        GROUP BY re."client" ORDER BY reads DESC
      `),
    ]);

    const a = agg[0];
    return {
      bookId,
      title: book.title,
      reads: a?.reads ?? 0,
      opens: a?.opens ?? 0,
      uniqueReaders: a?.uniquereaders ?? 0,
      avgCompletionPct: completion.get(bookId) ?? 0,
      lastReadAt: a?.lastreadat ? a.lastreadat.toISOString() : null,
      pageCount: pc[0]?.cnt ?? 0,
      trend: trend.map((t) => ({ date: t.date, reads: t.reads })),
      dropoff: dropoff.map((d) => ({ position: d.position, readers: d.readers })),
      byClient: byClient.map((c) => ({ client: c.client, reads: c.reads })),
    };
  }

  /**
   * Avg % completion per work = avg over readers of (distinct pages read ÷ book page count).
   * The numerator inner-joins `Page` so only reads of pages that STILL exist count — otherwise
   * a read of a since-deleted page would inflate the ratio above the current page count (and
   * disagree with the drop-off curve, which also only counts current pages).
   */
  private async completion(conds: Prisma.Sql[]): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ bookid: string; avgpct: number | string }[]>(Prisma.sql`
      SELECT sub."bookId" AS bookid, AVG(sub.frac) * 100 AS avgpct
      FROM (
        SELECT re."bookId",
               COUNT(DISTINCT re."pageId")::float / NULLIF(pc.cnt, 0) AS frac
        FROM "ReadEvent" re
        JOIN "Page" pg ON pg.id = re."pageId"
        JOIN (
          SELECT c."bookId" AS wid, COUNT(p.id) AS cnt
          FROM "Page" p JOIN "Chapter" c ON p."chapterId" = c.id
          GROUP BY c."bookId"
        ) pc ON pc.wid = re."bookId"
        WHERE re.kind = 'page_read' AND re."userId" IS NOT NULL ${this.andFrag(conds)}
        GROUP BY re."bookId", re."userId", pc.cnt
      ) sub
      GROUP BY sub."bookId"
    `);
    return new Map(rows.map((r) => [r.bookid, Math.round(Number(r.avgpct) * 10) / 10]));
  }

  // ── filter helpers (all values flow through Prisma.sql placeholders) ──────────
  private conds(q: StatsQuery) {
    const range: Prisma.Sql[] = [];
    const from = q.from ? this.dayBound(q.from, false) : null;
    const to = q.to ? this.dayBound(q.to, true) : null;
    if (from && !Number.isNaN(from.getTime())) range.push(Prisma.sql`re."createdAt" >= ${from}`);
    if (to && !Number.isNaN(to.getTime())) range.push(Prisma.sql`re."createdAt" <= ${to}`);
    const clientPrefix = q.client && q.client.toLowerCase() !== 'all' ? q.client.toLowerCase() : null;
    const client = clientPrefix ? [Prisma.sql`re."client" LIKE ${clientPrefix + '%'}`] : [];
    return { range, client, clientPrefix };
  }

  private andFrag(conds: Prisma.Sql[]): Prisma.Sql {
    return conds.length ? Prisma.sql`AND ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
  }

  /** Parse a from/to value. A date-only string is widened to start/end of that UTC day. */
  private dayBound(value: string, end: boolean): Date {
    const d = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (end) d.setUTCHours(23, 59, 59, 999);
      else d.setUTCHours(0, 0, 0, 0);
    }
    return d;
  }
}
