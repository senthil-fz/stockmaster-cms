import { createZodDto } from 'nestjs-zod';
import {
  articlesQuerySchema,
  createArticleSchema,
  updateArticleSchema,
} from '@stockmaster/shared';

export class CreateArticleDto extends createZodDto(createArticleSchema) {}
export class UpdateArticleDto extends createZodDto(updateArticleSchema) {}
export class ArticlesQueryDto extends createZodDto(articlesQuerySchema) {}
