import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TrackRead } from '../common/decorators/track-read.decorator';
import { AppHmacGuard } from '../common/guards/app-hmac.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { ReaderService } from './reader.service';

/**
 * Read-only API for the StockMaster mobile app. Serves ONLY published works.
 *
 * Auth: @Public() opts out of the editor JwtAuthGuard; instead these routes are gated by
 * an HMAC app-signature (AppHmacGuard) + IP rate limit (RateLimitGuard) — the "only our
 * app" scheme (B). The app must sign every request with MOBILE_APP_SECRET. See
 * docs/plans/2026-06-01-mobile-reader-api-design.md for the signing scheme and the upgrade
 * path to native attestation.
 */
@Public()
@UseGuards(RateLimitGuard, AppHmacGuard)
@Controller('v1')
export class ReaderController {
  constructor(private readonly reader: ReaderService) {}

  @Get('books')
  listBooks() {
    return this.reader.listBooks();
  }

  @Get('books/:id')
  @TrackRead('book_open')
  getBook(@Param('id') id: string) {
    return this.reader.getBook(id);
  }

  // Page is addressed by 1-based page number across the whole book. Returns the page
  // content plus pageNumber/totalPages and prevPage/nextPage for the reader's pager.
  @Get('books/:id/pages/:pageno')
  getBookPage(
    @Param('id') id: string,
    @Param('pageno') pageno: string,
    @Headers('x-client') client?: string,
  ) {
    return this.reader.getBookPage(id, Number(pageno), client ?? null);
  }
}
