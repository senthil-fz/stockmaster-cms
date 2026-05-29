import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route out of the global JwtAuthGuard (used for /auth/login, /auth/signup, /auth/refresh). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
