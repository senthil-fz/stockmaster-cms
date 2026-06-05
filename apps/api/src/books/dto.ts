import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  booksQuerySchema,
  createBookSchema,
  createChapterSchema,
  updateBookSchema,
  updateChapterSchema,
} from '@stockmaster/shared';

export class CreateBookDto extends createZodDto(createBookSchema) {}
export class UpdateBookDto extends createZodDto(updateBookSchema) {}
export class BooksQueryDto extends createZodDto(booksQuerySchema) {}
export class CreateChapterDto extends createZodDto(createChapterSchema) {}
export class UpdateChapterDto extends createZodDto(updateChapterSchema) {}

/** Publish body — an optional editor note ("fixed typos in ch.3") stored on the version. */
export const publishBookSchema = z.object({ note: z.string().max(500).optional() });
export class PublishBookDto extends createZodDto(publishBookSchema) {}
