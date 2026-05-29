import { createZodDto } from 'nestjs-zod';
import {
  createChapterSchema,
  createWorkSchema,
  updateChapterSchema,
  updateWorkSchema,
  worksQuerySchema,
} from '@blockpress/shared';

export class CreateWorkDto extends createZodDto(createWorkSchema) {}
export class UpdateWorkDto extends createZodDto(updateWorkSchema) {}
export class WorksQueryDto extends createZodDto(worksQuerySchema) {}
export class CreateChapterDto extends createZodDto(createChapterSchema) {}
export class UpdateChapterDto extends createZodDto(updateChapterSchema) {}
