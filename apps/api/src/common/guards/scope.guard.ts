import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { publishStatusSchema } from '@blockpress/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  IS_CONTENT_ROUTE,
  IS_JWT_ONLY,
  WORKS_DELETE,
  WORKS_PUBLISH,
} from '../decorators/scopes.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Per-route scope enforcement, run AFTER JwtAuthGuard has populated
 * req.scopes / req.authType. It is DEFAULT-DENY for non-wildcard (ApiKey)
 * principals: anything not positively allowlisted with @ContentRoute is
 * forbidden, and even allowlisted content routes 403 on a publish-transition,
 * a delete, or an edit of already-published content unless the key holds the
 * matching scope.
 *
 * The decision order is FIXED and security-load-bearing — do not reorder:
 *  1. @Public route                        -> allow (mirrors JwtAuthGuard; never
 *                                              reads scopes on reader routes).
 *  2. wildcard scope ['*'] (JWT)           -> allow (the backward-compat contract;
 *                                              MUST precede every per-scope check).
 *  3. @JwtOnly route                       -> 403 (ApiKey principals never reach
 *                                              key-management / user-creation).
 *  4. NOT a @ContentRoute                  -> 403 (DEFAULT-DENY).
 *  5. content route: publish/delete checks against works:publish / works:delete.
 *  6. PATCH on an already-published work/page without works:publish -> 403
 *     (no versioning exists; works:write means create + edit DRAFT rows only).
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  private readonly logger = new Logger(ScopeGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
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
    const wantsPublish =
      method === 'PATCH' &&
      parsedStatus.success &&
      parsedStatus.data === 'published';
    if (wantsPublish && !scopes.includes(WORKS_PUBLISH)) {
      this.logger.warn(
        `Denied ${req.method} ${req.url}: missing scope ${WORKS_PUBLISH} (publish)`,
      );
      throw new ForbiddenException('draft-only key cannot publish');
    }
    if (method === 'DELETE' && !scopes.includes(WORKS_DELETE)) {
      this.logger.warn(
        `Denied ${req.method} ${req.url}: missing scope ${WORKS_DELETE} (delete)`,
      );
      throw new ForbiddenException('draft-only key cannot delete');
    }

    // (6) Published-row guard: a works:write (no works:publish) key must not
    // mutate already-live content (no versioning exists). Only relevant for
    // PATCH on a works/:id or pages/:id route; a works:publish key is exempt.
    if (method === 'PATCH' && !scopes.includes(WORKS_PUBLISH)) {
      const routePath: string = req.route?.path ?? req.path ?? '';
      const isWorkRoute = routePath.includes('/works/');
      const isPageRoute = routePath.includes('/pages/');
      if (isWorkRoute || isPageRoute) {
        const id: string = req.params?.id;
        const current = isWorkRoute
          ? await this.prisma.work.findUnique({
              where: { id },
              select: { status: true },
            })
          : await this.prisma.page.findUnique({
              where: { id },
              select: { status: true },
            });
        if (!current) {
          // Match the service's not-found behavior so the guard does not mask a
          // 404 as a 403.
          throw new NotFoundException(
            isWorkRoute ? 'Work not found' : 'Page not found',
          );
        }
        if (current.status === 'published') {
          this.logger.warn(
            `Denied ${req.method} ${req.url}: missing scope ${WORKS_PUBLISH} (edit published)`,
          );
          throw new ForbiddenException(
            'draft-only key cannot edit published content',
          );
        }
      }
    }

    return true;
  }
}
