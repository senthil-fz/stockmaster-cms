import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ContentRoute } from '../common/decorators/scopes.decorator';
import { ArticlesService } from './articles.service';
import {
  ArticlesQueryDto,
  CreateArticleDto,
  PublishArticleDto,
  UpdateArticleDto,
} from './dto';

// Editor API namespace → /v1/admin/* (see books.controller.ts).
@Controller('admin')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('articles')
  @ContentRoute()
  list(@Query() query: ArticlesQueryDto) {
    return this.articles.list(query);
  }

  @Post('articles')
  @ContentRoute()
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthUser) {
    return this.articles.create(dto, user.id);
  }

  @Get('articles/:idOrSlug')
  @ContentRoute()
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.articles.detail(idOrSlug);
  }

  @Patch('articles/:id')
  @ContentRoute()
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articles.update(id, dto);
  }

  @Delete('articles/:id')
  @ContentRoute()
  remove(@Param('id') id: string) {
    return this.articles.remove(id);
  }

  // ─── Versioning (publish/unpublish/history/restore) ──────────────────────────
  // All gated on content:publish — see ScopeGuard. Mirrors the books surface.

  @Post('articles/:id/publish')
  @ContentRoute()
  publish(
    @Param('id') id: string,
    @Body() dto: PublishArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.articles.publish(id, user.id, dto.note);
  }

  @Post('articles/:id/unpublish')
  @ContentRoute()
  unpublish(@Param('id') id: string) {
    return this.articles.unpublish(id);
  }

  @Get('articles/:id/versions')
  @ContentRoute()
  listVersions(@Param('id') id: string) {
    return this.articles.listVersions(id);
  }

  @Get('articles/:id/draft')
  @ContentRoute()
  draft(@Param('id') id: string) {
    return this.articles.draft(id);
  }

  @Get('articles/:id/versions/:versionId')
  @ContentRoute()
  getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.articles.getVersion(id, versionId);
  }

  @Post('articles/:id/versions/:versionId/restore')
  @ContentRoute()
  restoreVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.articles.restoreVersion(id, versionId);
  }
}
