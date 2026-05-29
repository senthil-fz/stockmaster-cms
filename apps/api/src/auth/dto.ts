import { createZodDto } from 'nestjs-zod';
import { loginSchema, signupSchema } from '@blockpress/shared';

export class SignupDto extends createZodDto(signupSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
