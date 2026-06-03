import { SetMetadata } from '@nestjs/common';

/**
 * Scope strings an ApiKey may hold. They double as the contract between the
 * key-management layer (apiKeyScopeSchema) and ScopeGuard's per-scope checks.
 * They govern all editorial content (books + articles):
 * - `content:write`   → create + edit DRAFT books/articles/pages/chapters (the default).
 * - `content:publish` → transition content to `published` AND edit already-published rows.
 * - `content:delete`  → delete books/articles/pages/chapters.
 */
export type ContentScope = 'content:write' | 'content:publish' | 'content:delete';

export const CONTENT_WRITE: ContentScope = 'content:write';
export const CONTENT_PUBLISH: ContentScope = 'content:publish';
export const CONTENT_DELETE: ContentScope = 'content:delete';

export const IS_CONTENT_ROUTE = 'isContentRoute';

/**
 * Positively allowlists a books/articles/pages content route an ApiKey principal MAY
 * reach. ScopeGuard runs default-deny for non-wildcard (ApiKey) principals: any route
 * NOT carrying this marker is forbidden for an ApiKey. Reaching a marked route is
 * still subject to the per-scope publish/delete checks inside ScopeGuard.
 */
export const ContentRoute = () => SetMetadata(IS_CONTENT_ROUTE, true);

export const IS_JWT_ONLY = 'isJwtOnly';

/**
 * Marks a key-management / user-creation route that ApiKey principals must never
 * reach (e.g. POST /api-keys, POST /auth/users). ScopeGuard rejects any ApiKey
 * principal on a route carrying this marker with a 403, keeping the JWT-only
 * contract legible even though default-deny would already block an un-allowlisted route.
 */
export const JwtOnly = () => SetMetadata(IS_JWT_ONLY, true);
