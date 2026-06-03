import { createZodDto } from 'nestjs-zod';
import { statsQuerySchema } from '@stockmaster/shared';

export class StatsQueryDto extends createZodDto(statsQuerySchema) {}
