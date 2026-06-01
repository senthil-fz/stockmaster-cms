import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const SKEW_SECONDS = 300; // accept timestamps within ±5 min of server time
const NONCE_TTL_MS = SKEW_SECONDS * 1000;

/**
 * Lightweight "only our app" gate for the mobile reader API (scheme B).
 *
 * The Expo app signs each request with a shared secret (MOBILE_APP_SECRET):
 *
 *   canonical = `${METHOD}\n${path+query}\n${timestamp}\n${nonce}`
 *   signature = base64( HMAC-SHA256(secret, canonical) )
 *
 * sent as headers `X-App-Timestamp` (epoch seconds), `X-App-Nonce` (random per request),
 * `X-App-Signature`. The guard rejects stale timestamps (anti-replay window) and reused
 * nonces (anti-replay within the window), then verifies the signature in constant time.
 *
 * HONEST LIMIT: the secret ships inside the app binary, so a determined reverse-engineer
 * can extract it. This deters casual scraping/curl, not a motivated attacker — which is
 * the right bar for free content. Upgrade path is native attestation (Play Integrity /
 * App Attest). See docs/plans/2026-06-01-mobile-reader-api-design.md.
 *
 * The nonce cache is in-memory (per instance, cleared on restart) — fine for a single
 * node; use a shared store (Redis) if the API is horizontally scaled.
 */
@Injectable()
export class AppHmacGuard implements CanActivate {
  private readonly seenNonces = new Map<string, number>(); // nonce -> expiry (ms)

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const secret = process.env.MOBILE_APP_SECRET;
    if (!secret) throw new UnauthorizedException('app auth not configured');

    const ts = this.header(req, 'x-app-timestamp');
    const nonce = this.header(req, 'x-app-nonce');
    const sig = this.header(req, 'x-app-signature');
    if (!ts || !nonce || !sig) throw new UnauthorizedException('missing app signature');

    const tsNum = Number(ts);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > SKEW_SECONDS) {
      throw new UnauthorizedException('stale or invalid timestamp');
    }

    this.prune();
    if (this.seenNonces.has(nonce)) throw new UnauthorizedException('replayed request');

    const canonical = `${req.method.toUpperCase()}\n${req.originalUrl}\n${ts}\n${nonce}`;
    const expected = createHmac('sha256', secret).update(canonical).digest();
    const provided = Buffer.from(sig, 'base64');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('bad signature');
    }

    this.seenNonces.set(nonce, Date.now() + NONCE_TTL_MS);
    return true;
  }

  private header(req: Request, name: string): string | undefined {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  }

  private prune(): void {
    const now = Date.now();
    for (const [n, exp] of this.seenNonces) if (exp <= now) this.seenNonces.delete(n);
  }
}
