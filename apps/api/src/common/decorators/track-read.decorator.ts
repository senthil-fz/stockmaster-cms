import { SetMetadata } from '@nestjs/common';

export type ReadKind = 'page_read' | 'book_open' | 'article_open';
export const TRACK_READ_KEY = 'trackReadKind';

/**
 * Mark a read endpoint so ReadTrackingInterceptor records a ReadEvent on success.
 * `book_open` → the route param is a bookId; `page_read` → it's a pageId.
 * `article_open` is wired for parity with the books reader but not yet recorded: the
 * ReadEvent table has no articleId column and the article route param is `:idOrSlug`
 * (not `:id`), so the interceptor no-ops before any write. Functional article-read
 * analytics is a separate, follow-on change.
 */
export const TrackRead = (kind: ReadKind) => SetMetadata(TRACK_READ_KEY, kind);
