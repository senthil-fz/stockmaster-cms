import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { tap } from 'rxjs';
import { CLIENT_HEADER } from '@blockpress/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TRACK_READ_KEY, type ReadKind } from '../decorators/track-read.decorator';

/**
 * Records a ReadEvent for endpoints marked with @TrackRead. Fires only on a SUCCESSFUL
 * response and writes the event fire-and-forget (never awaited on the response path,
 * errors swallowed + logged) so analytics can never slow down or break a read.
 */
@Injectable()
export class ReadTrackingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ReadTrackingInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const kind = this.reflector.getAllAndOverride<ReadKind | undefined>(TRACK_READ_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!kind) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const userId = req.user?.id ?? null;
    const client = this.clientTag(req);
    const id = (req.params as Record<string, string> | undefined)?.id;

    return next.handle().pipe(
      tap(() => {
        // Success path only (an error short-circuits before this). Don't await.
        void this.record(kind, id, userId, client).catch((e) =>
          this.logger.warn(`read-tracking skipped: ${e instanceof Error ? e.message : String(e)}`),
        );
      }),
    );
  }

  private clientTag(req: Request): string {
    const raw = req.headers[CLIENT_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const tag = (value ?? '').toString().trim().toLowerCase().slice(0, 40);
    return tag || 'unknown';
  }

  private async record(
    kind: ReadKind,
    id: string | undefined,
    userId: string | null,
    client: string,
  ): Promise<void> {
    if (!id) return;
    let bookId: string | null = null;
    let pageId: string | null = null;

    if (kind === 'book_open') {
      bookId = id;
    } else {
      pageId = id;
      const page = await this.prisma.page.findUnique({
        where: { id },
        select: { chapter: { select: { bookId: true } } },
      });
      bookId = page?.chapter.bookId ?? null;
    }
    if (!bookId) return; // book no longer exists — nothing to attribute

    await this.prisma.readEvent.create({ data: { bookId, pageId, userId, client, kind } });
  }
}
