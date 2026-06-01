# Book read analytics (mobile + web) — design

**Date:** 2026-05-30
**Goal:** Track how books are read from the mobile app (and other clients) based on API
usage, aggregated **by book**. Answer: popularity (reads), engagement (how far), reach
(unique readers), and trends over time.

## Decisions (from brainstorm)

- **Metrics:** all four — popularity, engagement/completion, unique readers, trends.
- **Capture:** server-side, by instrumenting the existing read endpoints. The mobile app
  stays dumb — no separate analytics calls to build/trust.
- **Client attribution:** track **all** clients; each sends an `X-Client` header
  (`mobile-ios` / `mobile-android` / `web` / `unknown`). "Mobile" stats are a filter,
  not a separate pipeline. The header is a tag, **not** a security boundary.
- **Identity:** the read endpoints are authenticated (global `JwtAuthGuard`), so every
  event carries the reader's `userId` (needed for unique-readers + completion).
- **Scope (this pass):** API capture + `/stats` endpoints **and** a web Reporting
  dashboard (wire the existing no-op "Reporting" nav).

## Data model — one append-only table

```prisma
model ReadEvent {
  id        String   @id @default(cuid())
  workId    String                       // the book
  work      Work     @relation(fields: [workId], references: [id], onDelete: Cascade)
  pageId    String?                      // null for a book-open event
  userId    String?                      // reader; SetNull on user delete (keep, anonymized)
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  client    String   @default("unknown") // from X-Client
  kind      String                       // 'page_read' | 'book_open'
  createdAt DateTime @default(now())

  @@index([workId, createdAt])           // per-book + trends
  @@index([workId, userId])              // unique readers / completion
  @@index([client])
}
```
Every read = one row. All metrics are queries over this; no other storage. Roll-up table
+ retention are a **phase 2** (only if volume demands) — raw events stay the source of truth.

## Capture — a NestJS interceptor + a marker decorator

- `@TrackRead('book_open' | 'page_read')` on `WorksController.detail` (`GET /works/:id`)
  and `PagesController.get` (`GET /pages/:id`). `GET /works` (browsing) is **not** tracked.
- `ReadTrackingInterceptor` (global `APP_INTERCEPTOR`) reads that metadata via `Reflector`;
  on a **successful** response it fires a **non-blocking** insert (never awaited on the
  response path; errors swallowed + logged). Pulls `userId` from `req.user`, `client` from
  `X-Client`. For `page_read` it resolves `workId` from the page async (one extra query off
  the hot path); for `book_open`, `workId = :id`, `pageId = null`.

## Stats — derived queries (parameterized `$queryRaw` where group-by/ distinct is needed)

- `GET /stats/books?client=&from=&to=` → per-book summary: `reads`, `uniqueReaders`,
  `avgCompletionPct`, `lastReadAt`, ranked.
- `GET /stats/books/:id?client=&from=&to=` → detail: totals + **trend** (reads/day) +
  **drop-off** (readers reaching each page position).
- Completion = distinct `pageId` per (user, book) ÷ book's page count.

## Web — Reporting dashboard

Wire the existing "Reporting" nav (currently a no-op, like "Authors") to a dashboard:
per-book table (reads / unique readers / % completion / last read), a client filter
(All / Mobile / Web) and date range, and a per-book trend chart. TanStack Query +
`statsApi`, styled to match.

## Out of scope (now)

Roll-up/materialized daily table, event retention/pruning, session-level dedup
(define "a read" at query time for now), per-page heatmaps beyond drop-off.

## Known limitation

The web app sends `X-Client: web` on every request, so the **editor** opening a page
(`GET /pages/:id` while authoring) is counted as a `web` page-read — the `web` bucket
conflates reading with editing. This does **not** affect mobile stats (the primary goal).
To separate them later, tag the reader's reads distinctly (e.g. `web-reader` vs
`web-editor`) and filter the dashboard accordingly.

## Review fixes applied (post-implementation adversarial review)

- Completion now inner-joins `Page` so reads of since-deleted pages don't inflate it
  (verified: deleting a read page drops completion correctly).
- Drop-off `ROW_NUMBER` got a deterministic tiebreaker (`c.id`, `p.id`).
- `from`/`to` restricted to `YYYY-MM-DD` (clean 400, unambiguous UTC days) + `isNaN` guard.
- Dropped `@@index([client])` (couldn't serve the prefix `LIKE`; write cost on an
  append-heavy log).
- Dashboard rows made keyboard/screen-reader accessible (`role=button`, `tabIndex`,
  `onKeyDown`, `aria-expanded`).
