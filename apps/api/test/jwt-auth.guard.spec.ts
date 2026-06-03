/**
 * SECURITY GATE — JwtAuthGuard unit tests.
 *
 * Pins the global auth contract (Step 5 + the expiresAt amendment). Pure unit
 * tests: the guard is instantiated directly with a hand-built Reflector +
 * JwtService + PrismaService + a fake req. NO live DB, NO Nest DI container.
 *
 * Contract under test:
 *  - Bearer valid   -> req.user={id,email}, req.scopes=['*'], req.authType='jwt'
 *  - Bearer invalid -> 401 'Invalid or expired access token'
 *  - ApiKey valid   -> req.user.id=ownerUserId, req.scopes=key.scopes, authType='apikey'
 *  - ApiKey revoked -> 401 'Invalid API key'
 *  - ApiKey expired -> 401 'expired API key'   (distinct message from revoked)
 *  - ApiKey w/ SUSPENDED owner -> 401 'This account has been suspended'
 *  - ApiKey unknown -> 401 'Invalid API key'
 *  - malformed/absent header -> 401 'Missing or invalid authorization'
 *  - lastUsedAt update rejection is NON-FATAL (request still succeeds)
 *
 * The real `hashKey` runs (the findUnique mock ignores its argument), so the
 * ApiKey lookup path is exercised end-to-end minus the DB.
 */
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import type { PrismaService } from '../src/prisma/prisma.service';

function makeReflector(isPublic = false): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? isPublic : undefined,
  } as unknown as Reflector;
}

interface FakeReq {
  headers: Record<string, string | undefined>;
  user?: { id: string; email?: string };
  scopes?: string[];
  authType?: 'jwt' | 'apikey';
}

function makeCtx(req: FakeReq): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

/** JwtService double: verifyAsync resolves the payload or rejects. */
function makeJwt(opts: {
  payload?: Record<string, unknown>;
  reject?: boolean;
}): JwtService {
  return {
    verifyAsync: jest.fn(async () => {
      if (opts.reject) throw new Error('bad token');
      return opts.payload;
    }),
  } as unknown as JwtService;
}

/**
 * Prisma double for apiKey. `find` resolves the stored key row (or null);
 * `update` resolves/rejects to exercise the fire-and-forget lastUsedAt bump.
 */
function makePrisma(opts: {
  key?: {
    id: string;
    ownerUserId: string;
    scopes: string[];
    revokedAt: Date | null;
    expiresAt?: Date | null;
    // The guard loads the owner's suspension state alongside the key (one query,
    // `include: { owner: { select: { suspendedAt } } }`). Defaults to active.
    owner?: { suspendedAt: Date | null };
  } | null;
  updateRejects?: boolean;
}): { prisma: PrismaService; find: jest.Mock; update: jest.Mock } {
  const find = jest.fn(async () =>
    opts.key ? { owner: { suspendedAt: null }, ...opts.key } : null,
  );
  const update = jest.fn(() =>
    opts.updateRejects
      ? Promise.reject(new Error('db down'))
      : Promise.resolve({}),
  );
  const prisma = {
    apiKey: { findUnique: find, update },
  } as unknown as PrismaService;
  return { prisma, find, update };
}

/** Run canActivate and capture the thrown error (or null on success). */
async function capture(
  guard: JwtAuthGuard,
  ctx: ExecutionContext,
): Promise<unknown> {
  return guard.canActivate(ctx).then(
    () => null,
    (e) => e,
  );
}

const RAW_KEY = 'bp_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('JwtAuthGuard', () => {
  // ── @Public short-circuit (mirrors ScopeGuard clause 1) ──────────────────
  it('allows a @Public route without any credential', async () => {
    const guard = new JwtAuthGuard(
      makeReflector(true),
      makeJwt({ reject: true }),
      makePrisma({ key: null }).prisma,
    );
    const ctx = makeCtx({ headers: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Bearer JWT ───────────────────────────────────────────────────────────
  describe('Bearer JWT', () => {
    it("valid -> sets req.user{id,email}, scopes ['*'], authType 'jwt'", async () => {
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ payload: { sub: 'user-1', email: 'a@b.com' } }),
        makePrisma({ key: null }).prisma,
      );
      const req: FakeReq = {
        headers: { authorization: 'Bearer good.token.here' },
      };
      const ctx = makeCtx(req);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toEqual({ id: 'user-1', email: 'a@b.com' });
      expect(req.scopes).toEqual(['*']);
      expect(req.authType).toBe('jwt');
    });

    it("invalid -> 401 'Invalid or expired access token'", async () => {
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        makePrisma({ key: null }).prisma,
      );
      const ctx = makeCtx({
        headers: { authorization: 'Bearer bad.token' },
      });
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe(
        'Invalid or expired access token',
      );
      expect((err as UnauthorizedException).getStatus()).toBe(401);
    });

    it('never touches the ApiKey/DB path for a Bearer credential', async () => {
      const { prisma, find } = makePrisma({ key: null });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ payload: { sub: 'u', email: 'e@e.com' } }),
        prisma,
      );
      const ctx = makeCtx({ headers: { authorization: 'Bearer t' } });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(find).not.toHaveBeenCalled();
    });
  });

  // ── ApiKey credential ────────────────────────────────────────────────────
  describe('ApiKey credential', () => {
    it("valid -> req.user.id=ownerUserId, scopes, authType 'apikey'", async () => {
      const { prisma, update } = makePrisma({
        key: {
          id: 'k1',
          ownerUserId: 'owner-9',
          scopes: ['content:write'],
          revokedAt: null,
          expiresAt: null,
        },
      });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const req: FakeReq = { headers: { authorization: `ApiKey ${RAW_KEY}` } };
      const ctx = makeCtx(req);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toEqual({ id: 'owner-9' });
      expect(req.scopes).toEqual(['content:write']);
      expect(req.authType).toBe('apikey');
      // lastUsedAt bump fired.
      expect(update).toHaveBeenCalledWith({
        where: { id: 'k1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it("revoked -> 401 'Invalid API key'", async () => {
      const { prisma } = makePrisma({
        key: {
          id: 'k1',
          ownerUserId: 'owner-9',
          scopes: ['content:write'],
          revokedAt: new Date('2026-01-01T00:00:00Z'),
          expiresAt: null,
        },
      });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const ctx = makeCtx({ headers: { authorization: `ApiKey ${RAW_KEY}` } });
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe('Invalid API key');
      expect((err as UnauthorizedException).getStatus()).toBe(401);
    });

    it("EXPIRED (expiresAt in the past) -> 401 'expired API key' (distinct from revoked)", async () => {
      const { prisma } = makePrisma({
        key: {
          id: 'k1',
          ownerUserId: 'owner-9',
          scopes: ['content:write'],
          revokedAt: null,
          expiresAt: new Date(Date.now() - 60_000),
        },
      });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const ctx = makeCtx({ headers: { authorization: `ApiKey ${RAW_KEY}` } });
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe('expired API key');
      expect((err as UnauthorizedException).getStatus()).toBe(401);
    });

    it('a future expiresAt is still valid', async () => {
      const { prisma } = makePrisma({
        key: {
          id: 'k1',
          ownerUserId: 'owner-9',
          scopes: ['content:write'],
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const req: FakeReq = { headers: { authorization: `ApiKey ${RAW_KEY}` } };
      const ctx = makeCtx(req);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.authType).toBe('apikey');
    });

    it("owner SUSPENDED -> 401 'This account has been suspended' (key valid, never grants)", async () => {
      const { prisma, update } = makePrisma({
        key: {
          id: 'k1',
          ownerUserId: 'owner-9',
          scopes: ['content:write', 'content:publish'],
          revokedAt: null,
          expiresAt: null,
          owner: { suspendedAt: new Date('2026-01-01T00:00:00Z') },
        },
      });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const req: FakeReq = { headers: { authorization: `ApiKey ${RAW_KEY}` } };
      const ctx = makeCtx(req);
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(UnauthorizedException);
      // Same exact string the JWT login/refresh path uses — one suspension contract.
      expect((err as UnauthorizedException).message).toBe(
        'This account has been suspended',
      );
      expect((err as UnauthorizedException).getStatus()).toBe(401);
      // The request is never authenticated and the key is NOT marked used: the
      // suspension check precedes both the req mutation and the lastUsedAt bump.
      expect(req.authType).toBeUndefined();
      expect(req.user).toBeUndefined();
      expect(update).not.toHaveBeenCalled();
    });

    it('an ACTIVE owner (suspendedAt null) still authenticates', async () => {
      const { prisma } = makePrisma({
        key: {
          id: 'k1',
          ownerUserId: 'owner-9',
          scopes: ['content:write'],
          revokedAt: null,
          expiresAt: null,
          owner: { suspendedAt: null },
        },
      });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const req: FakeReq = { headers: { authorization: `ApiKey ${RAW_KEY}` } };
      const ctx = makeCtx(req);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toEqual({ id: 'owner-9' });
      expect(req.authType).toBe('apikey');
    });

    it("unknown key -> 401 'Invalid API key'", async () => {
      const { prisma } = makePrisma({ key: null });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const ctx = makeCtx({ headers: { authorization: `ApiKey ${RAW_KEY}` } });
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe('Invalid API key');
    });

    it('lastUsedAt update failure is NON-FATAL (request still succeeds)', async () => {
      const { prisma, update } = makePrisma({
        key: {
          id: 'k1',
          ownerUserId: 'owner-9',
          scopes: ['content:write'],
          revokedAt: null,
          expiresAt: null,
        },
        updateRejects: true,
      });
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const req: FakeReq = { headers: { authorization: `ApiKey ${RAW_KEY}` } };
      const ctx = makeCtx(req);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(update).toHaveBeenCalled();
      expect(req.authType).toBe('apikey');
      // Let the rejected fire-and-forget settle so it can't leak as an
      // unhandled rejection into a later test.
      await Promise.resolve();
    });

    it('an unexpected Prisma error degrades to 401, never a 500', async () => {
      const find = jest.fn(async () => {
        throw new Error('connection reset');
      });
      const prisma = {
        apiKey: { findUnique: find, update: jest.fn() },
      } as unknown as PrismaService;
      const guard = new JwtAuthGuard(
        makeReflector(),
        makeJwt({ reject: true }),
        prisma,
      );
      const ctx = makeCtx({ headers: { authorization: `ApiKey ${RAW_KEY}` } });
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe('Invalid API key');
      expect((err as UnauthorizedException).getStatus()).toBe(401);
    });
  });

  // ── Missing / malformed header ───────────────────────────────────────────
  describe('missing or malformed authorization header', () => {
    const cases: Array<[string, string | undefined]> = [
      ['absent header', undefined],
      ['empty string', ''],
      ['unknown scheme', 'Token abc'],
      ['bare token (no scheme)', 'abc.def.ghi'],
      ['lowercase bearer', 'bearer abc'],
      ['lowercase apikey', 'apikey abc'],
    ];
    it.each(cases)(
      "%s -> 401 'Missing or invalid authorization'",
      async (_name, value) => {
        const guard = new JwtAuthGuard(
          makeReflector(),
          makeJwt({ reject: true }),
          makePrisma({ key: null }).prisma,
        );
        const ctx = makeCtx({ headers: { authorization: value } });
        const err = await capture(guard, ctx);
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).message).toBe(
          'Missing or invalid authorization',
        );
        expect((err as UnauthorizedException).getStatus()).toBe(401);
      },
    );
  });
});
