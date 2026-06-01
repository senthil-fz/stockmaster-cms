import { createZodDto } from 'nestjs-zod';
import { statsQuerySchema } from '@blockpress/shared';

export class StatsQueryDto extends createZodDto(statsQuerySchema) {}
