import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ContentRoute } from '../common/decorators/scopes.decorator';
import { BookVersionsService } from './book-versions.service';
import { PublishBookDto } from './dto';

// Editor API namespace: routes resolve under /v1/admin/* (URI versioning adds /v1, this
// controller adds /admin). Distinct from the public reader's /v1/books.
//
// Publish / unpublish / restore are publish-level operations and must require the
// `content:publish` scope — a draft-only (`content:write`) key can never publish. The
// per-route publish-scope enforcement for these POST routes lives in ScopeGuard
// (common/guards), which currently only keys `content:publish` off a PATCH carrying
// `status: published`; see the cross-phase blocker noted for that file.
@Controller('admin')
export class BookVersionsController {
  constructor(private readonly versions: BookVersionsService) {}

  @Post('books/:id/publish')
  @ContentRoute()
  publish(
    @Param('id') id: string,
    @Body() dto: PublishBookDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.versions.publish(id, dto.note, user.id);
  }

  @Post('books/:id/unpublish')
  @ContentRoute()
  unpublish(@Param('id') id: string) {
    return this.versions.unpublish(id);
  }

  @Get('books/:id/versions')
  @ContentRoute()
  list(@Param('id') id: string) {
    return this.versions.list(id);
  }

  @Get('books/:id/draft')
  @ContentRoute()
  draft(@Param('id') id: string) {
    return this.versions.draft(id);
  }

  @Get('books/:id/versions/:versionId')
  @ContentRoute()
  detail(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.versions.get(id, versionId);
  }

  @Post('books/:id/versions/:versionId/restore')
  @ContentRoute()
  restore(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.versions.restore(id, versionId);
  }
}
