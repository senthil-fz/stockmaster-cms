import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ContentRoute } from '../common/decorators/scopes.decorator';
import { ArticlesService } from './articles.service';
import { ArticlesQueryDto, CreateArticleDto, UpdateArticleDto } from './dto';

@Controller()
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
}
