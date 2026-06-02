import { createZodDto } from 'nestjs-zod';
import { createApiKeySchema } from '@blockpress/shared';

export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
