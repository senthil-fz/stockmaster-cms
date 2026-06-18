import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { PublicService } from './public.service';

/**
 * Public, unauthenticated read API for the marketing website.
 *
 * Unlike the mobile ReaderController (/v1/books, /v1/articles) this is NOT HMAC-signed — a
 * static site can't hold MOBILE_APP_SECRET — so it exposes ONLY non-sensitive teaser data
 * (published article title + cover). Still @Public() (skips the editor JwtAuthGuard) and
 * rate-limited per IP. CORS for the site origins is configured in main.ts.
 *
 * Version pinned on the controller (not inherited) so this public contract can't drift if the
 * global defaultVersion is later bumped. URI versioning -> routes live under /v1/public/*.
 */
@Public()
@UseGuards(RateLimitGuard)
@Controller({ path: 'public', version: '1' })
export class PublicController {
  constructor(private readonly publicSvc: PublicService) {}

  // GET /v1/public/articles — published articles, title + cover only, newest first.
  @Get('articles')
  listArticles() {
    return this.publicSvc.listPublishedArticles();
  }
}
