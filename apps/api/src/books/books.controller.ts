import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ContentRoute } from '../common/decorators/scopes.decorator';
import { TrackRead } from '../common/decorators/track-read.decorator';
import { BooksService } from './books.service';
import {
  BooksQueryDto,
  CreateBookDto,
  CreateChapterDto,
  UpdateBookDto,
  UpdateChapterDto,
} from './dto';

// Editor API namespace: routes resolve under /v1/admin/* (URI versioning adds /v1, this
// controller adds /admin). Distinct from the public reader's /v1/books.
@Controller('admin')
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Get('books')
  @ContentRoute()
  list(@Query() query: BooksQueryDto) {
    return this.books.list(query);
  }

  @Post('books')
  @ContentRoute()
  create(@Body() dto: CreateBookDto, @CurrentUser() user: AuthUser) {
    return this.books.create(dto, user.id);
  }

  @Get('books/:id')
  @ContentRoute()
  @TrackRead('book_open')
  detail(@Param('id') id: string) {
    return this.books.detail(id);
  }

  @Patch('books/:id')
  @ContentRoute()
  update(@Param('id') id: string, @Body() dto: UpdateBookDto) {
    return this.books.update(id, dto);
  }

  @Delete('books/:id')
  @ContentRoute()
  remove(@Param('id') id: string) {
    return this.books.remove(id);
  }

  @Post('books/:id/chapters')
  @ContentRoute()
  addChapter(@Param('id') bookId: string, @Body() dto: CreateChapterDto) {
    return this.books.addChapter(bookId, dto);
  }

  @Patch('chapters/:id')
  @ContentRoute()
  updateChapter(@Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.books.updateChapter(id, dto);
  }

  @Delete('chapters/:id')
  @ContentRoute()
  removeChapter(@Param('id') id: string) {
    return this.books.removeChapter(id);
  }
}
