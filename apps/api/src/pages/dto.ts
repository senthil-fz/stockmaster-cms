import { createZodDto } from 'nestjs-zod';
import { createPageSchema, updatePageSchema } from '@blockpress/shared';

export class CreatePageDto extends createZodDto(createPageSchema) {}
export class UpdatePageDto extends createZodDto(updatePageSchema) {}
