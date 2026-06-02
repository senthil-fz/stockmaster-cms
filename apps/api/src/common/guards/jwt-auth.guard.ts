import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { hashKey } from '../../api-keys/api-key.crypto';

/**
 * Global auth guard (no Passport) — runs on every request except those marked
 * @Public(). Accepts EITHER a Bearer JWT (web/user sessions) or an
 * `Authorization: ApiKey <raw>` credential (programmatic/MCP callers), and is
 * FAIL-CLOSED: anything else is rejected with 401.
 *
 * - Bearer JWT  -> req.user = { id, email }, req.scopes = ['*'], req.authType = 'jwt'.
 *   The wildcard scope is the backward-compat contract read by ScopeGuard.
 * - ApiKey      -> req.user = { id: ownerUserId }, req.scopes = key.scopes,
 *   req.authType = 'apikey'. Revoked or expired keys are rejected; the per-route
 *   scope enforcement (default-deny) happens later in ScopeGuard.
 *
 * The Bearer path is fully self-contained and RETURNS before any ApiKey/DB code
 * is reachable, so existing JWT behavior is unchanged. The ApiKey branch is
 * wrapped so any unexpected (e.g. Prisma) error degrades to a 401, never a 500.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];

    if (header?.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length);
      try {
        const payload = await this.jwt.verifyAsync(token, {
          secret: process.env.JWT_ACCESS_SECRET,
        });
        req.user = { id: payload.sub, email: payload.email };
        req.scopes = ['*'];
        req.authType = 'jwt';
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired access token');
      }
    } else if (header?.startsWith('ApiKey ')) {
      try {
        const raw = header.slice('ApiKey '.length);
        const hashed = hashKey(raw);
        const key = await this.prisma.apiKey.findUnique({
          where: { hashedKey: hashed },
        });
        if (!key || key.revokedAt !== null) {
          throw new UnauthorizedException('Invalid API key');
        }
        if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
          throw new UnauthorizedException('expired API key');
        }
        req.user = { id: key.ownerUserId };
        req.scopes = key.scopes;
        req.authType = 'apikey';
        // Fire-and-forget; a failed lastUsedAt bump must never fail the request.
        this.prisma.apiKey
          .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
        return true;
      } catch (err) {
        // Re-throw intentional auth failures verbatim (preserves the distinct
        // 'Invalid API key' / 'expired API key' messages); degrade anything
        // unexpected (e.g. a Prisma error) to a 401 rather than a 500.
        if (err instanceof UnauthorizedException) throw err;
        throw new UnauthorizedException('Invalid API key');
      }
    }

    throw new UnauthorizedException('Missing or invalid authorization');
  }
}
