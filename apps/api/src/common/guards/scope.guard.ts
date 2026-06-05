import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { publishStatusSchema } from '@stockmaster/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  CONTENT_DELETE,
  CONTENT_PUBLISH,
  IS_CONTENT_ROUTE,
  IS_JWT_ONLY,
} from '../decorators/scopes.decorator';

/**
 * Per-route scope enforcement, run AFTER JwtAuthGuard has populated
 * req.scopes / req.authType. It is DEFAULT-DENY for non-wildcard (ApiKey)
 * principals: anything not positively allowlisted with @ContentRoute is
 * forbidden, and even allowlisted content routes 403 on a publish-transition
 * or a delete unless the key holds the matching scope.
 *
 * Editing DRAFT content carries no extra check: under content versioning the
 * live Book→Chapter→Page tree (and Article.content) is a PRIVATE working draft —
 * the public is served the frozen published snapshot — so a content:write key
 * editing it changes nothing public. Going live is the only gated transition,
 * and that is the publish route (clause 5, content:publish).
 *
 * The decision order is FIXED and security-load-bearing — do not reorder:
 *  1. @Public route                        -> allow (mirrors JwtAuthGuard; never
 *                                              reads scopes on reader routes).
 *  2. wildcard scope ['*'] (JWT)           -> allow (the backward-compat contract;
 *                                              MUST precede every per-scope check).
 *  3. @JwtOnly route                       -> 403 (ApiKey principals never reach
 *                                              key-management / user-creation).
 *  4. NOT a @ContentRoute                  -> 403 (DEFAULT-DENY).
 *  5. content route: publish/delete checks against content:publish / content:delete.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  private readonly logger = new Logger(ScopeGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const handler = ctx.getHandler();
    const cls = ctx.getClass();

    // (1) @Public — allow without ever touching scopes (reader routes).
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      cls,
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const scopes: string[] = req.scopes ?? [];

    // (2) Wildcard (JWT) — full backward-compat bypass. MUST precede all
    // per-scope logic so existing web/user sessions are unaffected.
    if (scopes.includes('*')) return true;

    // (3) @JwtOnly — ApiKey principals must never reach key-management /
    // user-creation routes. Anything past clause 2 is non-JWT (a JWT carries
    // '*' and already returned at clause 2), so req.authType is asserted to be
    // 'jwt' structurally: a JWT-only route is unconditionally forbidden here.
    const isJwtOnly = this.reflector.getAllAndOverride<boolean>(IS_JWT_ONLY, [
      handler,
      cls,
    ]);
    if (isJwtOnly) {
      this.logger.warn(
        `Denied ${req.method} ${req.url}: JWT-only route reached by authType=${req.authType}`,
      );
      throw new ForbiddenException('this endpoint requires a user session');
    }

    // (4) DEFAULT-DENY — any route not positively allowlisted is forbidden for
    // a non-wildcard (ApiKey) principal.
    const isContentRoute = this.reflector.getAllAndOverride<boolean>(
      IS_CONTENT_ROUTE,
      [handler, cls],
    );
    if (!isContentRoute) {
      this.logger.warn(
        `Denied ${req.method} ${req.url}: ApiKey on non-content route`,
      );
      throw new ForbiddenException('API key not permitted on this route');
    }

    // (5) Content route: publish-transition + delete scope checks.
    const method: string = req.method;
    const body = req.body;
    const rawStatus =
      body && typeof body === 'object' && !Array.isArray(body)
        ? body.status
        : undefined;
    const parsedStatus = publishStatusSchema.safeParse(rawStatus);
    // The dedicated versioning routes (POST …/publish, …/unpublish,
    // …/versions/:versionId/restore) are the only publish path now that PATCH no
    // longer accepts `status`; they must require content:publish. The legacy
    // PATCH-with-status check is kept as defense-in-depth for any caller still
    // sending the (now-ignored) field.
    const routePath: string = req.route?.path ?? req.path ?? '';
    const isVersionPublishRoute =
      method === 'POST' &&
      /\/(publish|unpublish|restore)$/.test(routePath);
    const wantsPublish =
      isVersionPublishRoute ||
      (method === 'PATCH' &&
        parsedStatus.success &&
        parsedStatus.data === 'published');
    if (wantsPublish && !scopes.includes(CONTENT_PUBLISH)) {
      this.logger.warn(
        `Denied ${req.method} ${req.url}: missing scope ${CONTENT_PUBLISH} (publish)`,
      );
      throw new ForbiddenException('draft-only key cannot publish');
    }
    if (method === 'DELETE' && !scopes.includes(CONTENT_DELETE)) {
      this.logger.warn(
        `Denied ${req.method} ${req.url}: missing scope ${CONTENT_DELETE} (delete)`,
      );
      throw new ForbiddenException('draft-only key cannot delete');
    }

    // Editing draft content needs no further check — it is private under
    // versioning (the public sees the frozen snapshot); publishing is the only
    // gated transition and was handled at clause 5.
    return true;
  }
}
