import { createZodDto } from 'nestjs-zod';
import { presignRequestSchema } from '@blockpress/shared';

export class PresignDto extends createZodDto(presignRequestSchema) {}
