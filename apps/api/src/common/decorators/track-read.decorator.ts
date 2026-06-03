import { SetMetadata } from '@nestjs/common';

export type ReadKind = 'page_read' | 'book_open';
export const TRACK_READ_KEY = 'trackReadKind';

/**
 * Mark a read endpoint so ReadTrackingInterceptor records a ReadEvent on success.
 * `book_open` → the route param is a bookId; `page_read` → it's a pageId.
 */
export const TrackRead = (kind: ReadKind) => SetMetadata(TRACK_READ_KEY, kind);
