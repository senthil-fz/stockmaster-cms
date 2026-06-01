import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TrackRead } from '../common/decorators/track-read.decorator';
import { PagesService } from './pages.service';
import { CreatePageDto, UpdatePageDto } from './dto';

@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Post('chapters/:id/pages')
  addPage(@Param('id') chapterId: string, @Body() dto: CreatePageDto) {
    return this.pages.addPage(chapterId, dto);
  }

  @Get('pages/:id')
  @TrackRead('page_read')
  get(@Param('id') id: string) {
    return this.pages.get(id);
  }

  @Patch('pages/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePageDto) {
    return this.pages.update(id, dto);
  }

  @Delete('pages/:id')
  remove(@Param('id') id: string) {
    return this.pages.remove(id);
  }
}
