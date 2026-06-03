import { createZodDto } from 'nestjs-zod';
import {
  booksQuerySchema,
  createBookSchema,
  createChapterSchema,
  updateBookSchema,
  updateChapterSchema,
} from '@blockpress/shared';

export class CreateBookDto extends createZodDto(createBookSchema) {}
export class UpdateBookDto extends createZodDto(updateBookSchema) {}
export class BooksQueryDto extends createZodDto(booksQuerySchema) {}
export class CreateChapterDto extends createZodDto(createChapterSchema) {}
export class UpdateChapterDto extends createZodDto(updateChapterSchema) {}
