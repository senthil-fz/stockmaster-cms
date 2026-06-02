import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ContentRoute } from '../common/decorators/scopes.decorator';
import { TrackRead } from '../common/decorators/track-read.decorator';
import { PagesService } from './pages.service';
import { CreatePageDto, UpdatePageDto } from './dto';

@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Post('chapters/:id/pages')
  @ContentRoute()
  addPage(@Param('id') chapterId: string, @Body() dto: CreatePageDto) {
    return this.pages.addPage(chapterId, dto);
  }

  @Get('pages/:id')
  @ContentRoute()
  @TrackRead('page_read')
  get(@Param('id') id: string) {
    return this.pages.get(id);
  }

  @Patch('pages/:id')
  @ContentRoute()
  update(@Param('id') id: string, @Body() dto: UpdatePageDto) {
    return this.pages.update(id, dto);
  }

  @Delete('pages/:id')
  @ContentRoute()
  remove(@Param('id') id: string) {
    return this.pages.remove(id);
  }
}
