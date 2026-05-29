import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { WorksService } from './works.service';
import {
  CreateChapterDto,
  CreateWorkDto,
  UpdateChapterDto,
  UpdateWorkDto,
  WorksQueryDto,
} from './dto';

@Controller()
export class WorksController {
  constructor(private readonly works: WorksService) {}

  @Get('works')
  list(@Query() query: WorksQueryDto) {
    return this.works.list(query);
  }

  @Post('works')
  create(@Body() dto: CreateWorkDto, @CurrentUser() user: AuthUser) {
    return this.works.create(dto, user.id);
  }

  @Get('works/:id')
  detail(@Param('id') id: string) {
    return this.works.detail(id);
  }

  @Patch('works/:id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkDto) {
    return this.works.update(id, dto);
  }

  @Delete('works/:id')
  remove(@Param('id') id: string) {
    return this.works.remove(id);
  }

  @Post('works/:id/chapters')
  addChapter(@Param('id') workId: string, @Body() dto: CreateChapterDto) {
    return this.works.addChapter(workId, dto);
  }

  @Patch('chapters/:id')
  updateChapter(@Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.works.updateChapter(id, dto);
  }

  @Delete('chapters/:id')
  removeChapter(@Param('id') id: string) {
    return this.works.removeChapter(id);
  }
}
