import { createZodDto } from 'nestjs-zod';
import { loginSchema, signupSchema, updateUserSchema } from '@stockmaster/shared';

// Body for POST /auth/users (authenticated user-creation). Same shape as the old public
// signup; reuses `signupSchema` (name/email/password).
export class CreateUserDto extends createZodDto(signupSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
// Body for PATCH /auth/users/:id — edit a member and/or toggle suspension.
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
