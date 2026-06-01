import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 120; // 120 requests / minute / client IP

/**
 * Minimal in-memory fixed-window rate limiter for the public reader API, keyed by client
 * IP. Deters bulk scraping without extra infra.
 *
 * NOTE: in-memory and per-instance — counts are not shared across replicas and reset on
 * restart. For production at scale, replace with @nestjs/throttler backed by Redis. Also
 * requires `app.set('trust proxy', …)` behind a load balancer so req.ip is the real client.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    const rec = this.hits.get(key);
    if (!rec || rec.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      this.prune(now);
      return true;
    }

    rec.count += 1;
    if (rec.count > MAX_PER_WINDOW) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private prune(now: number): void {
    for (const [k, rec] of this.hits) if (rec.resetAt <= now) this.hits.delete(k);
  }
}
