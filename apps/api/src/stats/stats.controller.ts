import { Controller, Get, Param, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsQueryDto } from './dto';

// Read-analytics for the web Reporting dashboard. Protected by the global JwtAuthGuard.
@Controller('admin/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('books')
  books(@Query() query: StatsQueryDto) {
    return this.stats.books(query);
  }

  @Get('books/:id')
  bookDetail(@Param('id') id: string, @Query() query: StatsQueryDto) {
    return this.stats.bookDetail(id, query);
  }
}
