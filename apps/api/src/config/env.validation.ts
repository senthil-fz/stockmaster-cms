import { z } from 'zod';

// A secret must be long enough to resist brute force regardless of environment.
const secret = z.string().min(32, 'must be at least 32 characters');
const placeholder = /change[-_]?me/i;

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.string().min(1, 'is required'),
    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }
    // Reject the shipped dev placeholders in production (they are public in .env.example).
    if (env.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (placeholder.test(env[key])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'is still a dev placeholder — set a real secret in production',
          });
        }
      }
    }
  });

export type ApiEnv = z.infer<typeof envSchema>;

/**
 * Boot-time env validation for ConfigModule. Throws (aborting startup) with an
 * aggregated, readable message rather than letting a missing/weak secret surface
 * as a runtime 500 — or worse, silently signing forgeable tokens with a placeholder.
 */
export function validateEnv(config: Record<string, unknown>): ApiEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
