import { Module } from '@nestjs/common';
import { BookVersionsController } from './book-versions.controller';
import { BookVersionsService } from './book-versions.service';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

@Module({
  controllers: [BooksController, BookVersionsController],
  providers: [BooksService, BookVersionsService],
})
export class BooksModule {}
