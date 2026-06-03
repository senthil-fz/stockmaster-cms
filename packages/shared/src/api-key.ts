import { z } from 'zod';

/**
 * The scopes an API key may hold. Pinned to a fixed enum so a caller can never mint a
 * key broader than this set (e.g. a `['*']` or `['admin']` key): ScopeGuard's per-scope
 * checks read exactly these strings. They govern all editorial content (books + articles).
 * - `content:write`   → create + edit DRAFT books/articles/pages/chapters (the default).
 * - `content:publish` → transition content to `published` AND edit already-published rows.
 * - `content:delete`  → delete books/articles/pages/chapters.
 */
export const apiKeyScopeSchema = z.enum(['content:write', 'content:publish', 'content:delete']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

// ─── Write model (request DTO) ────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(apiKeyScopeSchema).min(1).default(['content:write']),
  /**
   * Optional time-box. `revokedAt` remains the primary kill switch; `expiresAt` lets a
   * key auto-expire. Coerced from an ISO instant and refined to be in the future, so a
   * past date is rejected (400) before it can mint an already-dead key. Absent = never expires.
   */
  expiresAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), 'expiresAt must be in the future')
    .optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// ─── Read models ──────────────────────────────────────────────────────────────

/** Non-sensitive view of a key. NEVER carries the hashedKey or the raw secret. */
export const apiKeySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  // Read-model dates are ISO strings over the wire (matches bookSummarySchema);
  // the API serializes Prisma Date objects to JSON before they reach any client.
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;

/**
 * Response from POST /api-keys. Carries the raw secret EXACTLY ONCE — it is never
 * persisted in plaintext and never returned again (only the sha256 hash is stored).
 */
export const createApiKeyResponseSchema = apiKeySummarySchema.extend({
  rawKey: z.string(),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
