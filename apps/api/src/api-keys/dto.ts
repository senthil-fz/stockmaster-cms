import { createZodDto } from 'nestjs-zod';
import { createApiKeySchema } from '@stockmaster/shared';

export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
