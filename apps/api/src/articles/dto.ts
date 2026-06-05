import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  articlesQuerySchema,
  createArticleSchema,
  updateArticleSchema,
} from '@stockmaster/shared';

export class CreateArticleDto extends createZodDto(createArticleSchema) {}
export class UpdateArticleDto extends createZodDto(updateArticleSchema) {}
export class ArticlesQueryDto extends createZodDto(articlesQuerySchema) {}

// Optional editor note recorded on the new version ("fixed a typo"). No shared schema —
// the publish body is API-local.
export const publishArticleSchema = z.object({ note: z.string().max(280).optional() });
export class PublishArticleDto extends createZodDto(publishArticleSchema) {}
