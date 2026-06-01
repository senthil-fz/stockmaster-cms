import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BookStat,
  BookStatDetail,
  BookStatsResponse,
  StatsQuery,
  WorkKind,
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
      { workid: string; reads: number; opens: number; uniquereaders: number; lastreadat: Date | null }[]
    >(Prisma.sql`
      SELECT re."workId" AS workid,
             COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads,
             COUNT(*) FILTER (WHERE re.kind = 'book_open')::int AS opens,
             COUNT(DISTINCT re."userId")::int AS uniquereaders,
             MAX(re."createdAt") AS lastreadat
      FROM "ReadEvent" re
      WHERE TRUE ${filter}
      GROUP BY re."workId"
    `);

    const out: BookStatsResponse = {
      client: clientPrefix,
      from: q.from ?? null,
      to: q.to ?? null,
      totals: { reads: 0, uniqueReaders: 0, books: 0 },
      books: [],
    };
    if (agg.length === 0) return out;

    const workIds = agg.map((a) => a.workid);
    const [completion, works, totalReaders] = await Promise.all([
      this.completion([...range, ...client]),
      this.prisma.work.findMany({
        where: { id: { in: workIds } },
        select: { id: true, title: true, kind: true },
      }),
      this.prisma.$queryRaw<{ c: number }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT re."userId")::int AS c FROM "ReadEvent" re WHERE TRUE ${filter}
      `),
    ]);
    const meta = new Map(works.map((w) => [w.id, w]));

    const books: BookStat[] = agg
      .filter((a) => meta.has(a.workid))
      .map((a) => {
        const m = meta.get(a.workid)!;
        return {
          workId: a.workid,
          title: m.title,
          kind: m.kind as WorkKind,
          reads: a.reads,
          opens: a.opens,
          uniqueReaders: a.uniquereaders,
          avgCompletionPct: completion.get(a.workid) ?? 0,
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

  async bookDetail(workId: string, q: StatsQuery): Promise<BookStatDetail> {
    const work = await this.prisma.work.findUnique({
      where: { id: workId },
      select: { id: true, title: true, kind: true },
    });
    if (!work) throw new NotFoundException('Work not found');

    const { range, client } = this.conds(q);
    const filter = this.andFrag([...range, ...client]);

    const [pc, agg, completion, trend, dropoff, byClient] = await Promise.all([
      this.prisma.$queryRaw<{ cnt: number }[]>(Prisma.sql`
        SELECT COUNT(p.id)::int AS cnt FROM "Page" p
        JOIN "Chapter" c ON p."chapterId" = c.id WHERE c."workId" = ${workId}
      `),
      this.prisma.$queryRaw<
        { reads: number; opens: number; uniquereaders: number; lastreadat: Date | null }[]
      >(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads,
               COUNT(*) FILTER (WHERE re.kind = 'book_open')::int AS opens,
               COUNT(DISTINCT re."userId")::int AS uniquereaders,
               MAX(re."createdAt") AS lastreadat
        FROM "ReadEvent" re WHERE re."workId" = ${workId} ${filter}
      `),
      this.completion([Prisma.sql`re."workId" = ${workId}`, ...range, ...client]),
      this.prisma.$queryRaw<{ date: string; reads: number }[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', re."createdAt"), 'YYYY-MM-DD') AS date,
               COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads
        FROM "ReadEvent" re WHERE re."workId" = ${workId} ${filter}
        GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<{ position: number; readers: number }[]>(Prisma.sql`
        WITH pos AS (
          SELECT p.id AS pageid,
                 ROW_NUMBER() OVER (ORDER BY c."order", c.id, p."order", p.id) AS position
          FROM "Page" p JOIN "Chapter" c ON p."chapterId" = c.id WHERE c."workId" = ${workId}
        )
        SELECT pos.position::int AS position, COUNT(DISTINCT re."userId")::int AS readers
        FROM "ReadEvent" re JOIN pos ON pos.pageid = re."pageId"
        WHERE re."workId" = ${workId} AND re.kind = 'page_read' AND re."userId" IS NOT NULL ${filter}
        GROUP BY pos.position ORDER BY pos.position
      `),
      // client split ignores the client filter on purpose — show every client's share.
      this.prisma.$queryRaw<{ client: string; reads: number }[]>(Prisma.sql`
        SELECT re."client" AS client, COUNT(*) FILTER (WHERE re.kind = 'page_read')::int AS reads
        FROM "ReadEvent" re WHERE re."workId" = ${workId} ${this.andFrag(range)}
        GROUP BY re."client" ORDER BY reads DESC
      `),
    ]);

    const a = agg[0];
    return {
      workId,
      title: work.title,
      kind: work.kind as WorkKind,
      reads: a?.reads ?? 0,
      opens: a?.opens ?? 0,
      uniqueReaders: a?.uniquereaders ?? 0,
      avgCompletionPct: completion.get(workId) ?? 0,
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
    const rows = await this.prisma.$queryRaw<{ workid: string; avgpct: number | string }[]>(Prisma.sql`
      SELECT sub."workId" AS workid, AVG(sub.frac) * 100 AS avgpct
      FROM (
        SELECT re."workId",
               COUNT(DISTINCT re."pageId")::float / NULLIF(pc.cnt, 0) AS frac
        FROM "ReadEvent" re
        JOIN "Page" pg ON pg.id = re."pageId"
        JOIN (
          SELECT c."workId" AS wid, COUNT(p.id) AS cnt
          FROM "Page" p JOIN "Chapter" c ON p."chapterId" = c.id
          GROUP BY c."workId"
        ) pc ON pc.wid = re."workId"
        WHERE re.kind = 'page_read' AND re."userId" IS NOT NULL ${this.andFrag(conds)}
        GROUP BY re."workId", re."userId", pc.cnt
      ) sub
      GROUP BY sub."workId"
    `);
    return new Map(rows.map((r) => [r.workid, Math.round(Number(r.avgpct) * 10) / 10]));
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
