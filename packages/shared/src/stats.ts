import { z } from 'zod';
import { workKindSchema } from './work';

/**
 * Book read-analytics contracts (shared by the API and the web Reporting dashboard).
 * All figures are derived from the append-only `ReadEvent` log.
 */

/** Header the client (mobile / web) sends to tag its reads. A tag, not a security boundary. */
export const CLIENT_HEADER = 'x-client';

/** Inclusive calendar day (UTC), `YYYY-MM-DD`. Restricting the shape keeps the range
 * unambiguous (always whole UTC days) and rejects malformed input with a clean 400. */
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

/**
 * Query for the stats endpoints. `client` is a prefix filter:
 *   "mobile" → mobile-ios, mobile-android …;  "web" → web;  omitted/"all" → every client.
 */
export const statsQuerySchema = z.object({
  client: z.string().max(40).optional(),
  from: dayString.optional(),
  to: dayString.optional(),
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

/** Per-book summary row (the Reporting table). */
export const bookStatSchema = z.object({
  workId: z.string(),
  title: z.string(),
  kind: workKindSchema,
  reads: z.number().int(), // page_read events in range
  opens: z.number().int(), // book_open events in range
  uniqueReaders: z.number().int(),
  avgCompletionPct: z.number(), // 0–100, averaged over readers
  lastReadAt: z.string().nullable(),
});
export type BookStat = z.infer<typeof bookStatSchema>;

export const bookStatsResponseSchema = z.object({
  client: z.string().nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  totals: z.object({
    reads: z.number().int(),
    uniqueReaders: z.number().int(),
    books: z.number().int(),
  }),
  books: z.array(bookStatSchema), // ranked by reads desc
});
export type BookStatsResponse = z.infer<typeof bookStatsResponseSchema>;

/** One day of a book's read trend. */
export const trendPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  reads: z.number().int(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

/** Readers who reached the page at this 1-based position — a completion drop-off curve. */
export const dropoffPointSchema = z.object({
  position: z.number().int(),
  readers: z.number().int(),
});
export type DropoffPoint = z.infer<typeof dropoffPointSchema>;

export const clientBreakdownSchema = z.object({
  client: z.string(),
  reads: z.number().int(),
});
export type ClientBreakdown = z.infer<typeof clientBreakdownSchema>;

/** Per-book detail (drill-down): summary + trend + drop-off + client split. */
export const bookStatDetailSchema = bookStatSchema.extend({
  pageCount: z.number().int(),
  trend: z.array(trendPointSchema),
  dropoff: z.array(dropoffPointSchema),
  byClient: z.array(clientBreakdownSchema),
});
export type BookStatDetail = z.infer<typeof bookStatDetailSchema>;
