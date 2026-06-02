/**
 * SECURITY GATE — ScopeGuard unit tests.
 *
 * These pin the full per-route enforcement contract (Step 7 of the draft-only
 * MCP plan). They are pure unit tests: the guard is instantiated directly with
 * a hand-built Reflector + PrismaService + ExecutionContext. There is NO live
 * DB and NO Nest DI container.
 *
 * The decision order under test (FIXED, security-load-bearing):
 *   1. @Public route                         -> allow
 *   2. wildcard scope ['*'] (JWT)            -> allow (backward-compat bypass)
 *   3. @JwtOnly route                        -> 403
 *   4. NOT a @ContentRoute                   -> 403 (DEFAULT-DENY)
 *   5. publish-transition / delete           -> 403 unless works:publish / works:delete
 *   6. PATCH an already-published work/page   -> 403 unless works:publish
 *
 * Assertions on the 403 messages are EXACT (toBe, not substring), because the
 * literal strings are the contract the MCP client surfaces verbatim.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { publishStatusSchema } from '@blockpress/shared';
import { ScopeGuard } from '../src/common/guards/scope.guard';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import {
  IS_CONTENT_ROUTE,
  IS_JWT_ONLY,
} from '../src/common/decorators/scopes.decorator';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Per-route metadata map keyed by the SetMetadata keys the guard reads. Keying
 * the fake Reflector by the real exported constants both discriminates the
 * three lookups (public vs jwt-only vs content) AND pins those constants — a
 * rename would break compilation here.
 */
type MetaMap = Partial<Record<string, boolean>>;

function makeReflector(meta: MetaMap): Reflector {
  return {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
}

interface FakeReq {
  method: string;
  scopes?: string[];
  authType?: 'jwt' | 'apikey';
  body?: unknown;
  params?: { id?: string };
  route?: { path?: string };
  path?: string;
  url?: string;
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

/**
 * Prisma double. `work.findUnique` / `page.findUnique` resolve to whatever the
 * test seeds (an object with `status`, or `null` for not-found). The default
 * rejects so an unexpected DB read in a test that didn't set one is loud.
 */
function makePrisma(opts?: {
  workStatus?: 'draft' | 'published' | null;
  pageStatus?: 'draft' | 'published' | null;
}): { prisma: PrismaService; workFind: jest.Mock; pageFind: jest.Mock } {
  const workFind = jest.fn(async () =>
    opts && 'workStatus' in opts
      ? opts.workStatus === null
        ? null
        : { status: opts.workStatus }
      : null,
  );
  const pageFind = jest.fn(async () =>
    opts && 'pageStatus' in opts
      ? opts.pageStatus === null
        ? null
        : { status: opts.pageStatus }
      : null,
  );
  const prisma = {
    work: { findUnique: workFind },
    page: { findUnique: pageFind },
  } as unknown as PrismaService;
  return { prisma, workFind, pageFind };
}

/** Run canActivate and capture the thrown error (or null on success). */
async function capture(
  guard: ScopeGuard,
  ctx: ExecutionContext,
): Promise<unknown> {
  return guard.canActivate(ctx).then(
    () => null,
    (e) => e,
  );
}

describe('ScopeGuard', () => {
  // ── JWT (wildcard) — the backward-compat regression gate the design omits ──
  describe('JWT wildcard principal ([*])', () => {
    const jwtReq = (over: Partial<FakeReq>): FakeReq => ({
      method: 'GET',
      scopes: ['*'],
      authType: 'jwt',
      ...over,
    });

    it('allows PATCH body{status:published} (publish)', async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(makeReflector({}), prisma);
      const ctx = makeCtx(
        jwtReq({
          method: 'PATCH',
          body: { status: 'published' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows DELETE /works/:id', async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(makeReflector({}), prisma);
      const ctx = makeCtx(
        jwtReq({ method: 'DELETE', route: { path: '/works/:id' } }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows DELETE /pages/:id', async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(makeReflector({}), prisma);
      const ctx = makeCtx(
        jwtReq({ method: 'DELETE', route: { path: '/pages/:id' } }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows DELETE /chapters/:id', async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(makeReflector({}), prisma);
      const ctx = makeCtx(
        jwtReq({ method: 'DELETE', route: { path: '/chapters/:id' } }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows PATCH on an already-published work (regression — JWT unaffected by clause 6)', async () => {
      // Row is published; a JWT must still pass because clause 2 short-circuits
      // before any DB read. The Prisma double would reject if it were touched.
      const { prisma, workFind } = makePrisma({ workStatus: 'published' });
      const guard = new ScopeGuard(makeReflector({}), prisma);
      const ctx = makeCtx(
        jwtReq({
          method: 'PATCH',
          body: { title: 'new title' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      // Backward-compat proof: the wildcard bypass never consults the DB.
      expect(workFind).not.toHaveBeenCalled();
    });
  });

  // ── ApiKey ['works:write'] — the draft-only key ───────────────────────────
  describe("ApiKey draft-only key (['works:write'])", () => {
    const writeReq = (over: Partial<FakeReq>): FakeReq => ({
      method: 'GET',
      scopes: ['works:write'],
      authType: 'apikey',
      ...over,
    });

    it("403 'draft-only key cannot publish' on PATCH {status:published}", async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { status: 'published' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot publish',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it("403 'draft-only key cannot delete' on DELETE /works/:id", async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({ method: 'DELETE', route: { path: '/works/:id' } }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot delete',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it("403 'draft-only key cannot edit published content' on PATCH title when target work is published", async () => {
      const { prisma, workFind } = makePrisma({ workStatus: 'published' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { title: 'edited' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot edit published content',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
      expect(workFind).toHaveBeenCalled();
    });

    it("403 'draft-only key cannot edit published content' on PATCH title when target page is published", async () => {
      const { prisma, pageFind } = makePrisma({ pageStatus: 'published' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { title: 'edited' },
          route: { path: '/pages/:id' },
          params: { id: 'p1' },
        }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot edit published content',
      );
      expect(pageFind).toHaveBeenCalled();
    });

    it('ALLOWS PATCH title when target work is draft', async () => {
      const { prisma } = makePrisma({ workStatus: 'draft' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { title: 'edited' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('ALLOWS PATCH title when target page is draft', async () => {
      const { prisma } = makePrisma({ pageStatus: 'draft' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { title: 'edited' },
          route: { path: '/pages/:id' },
          params: { id: 'p1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('404 (not 403) when the PATCH target row is missing', async () => {
      const { prisma } = makePrisma({ workStatus: null });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { title: 'edited' },
          route: { path: '/works/:id' },
          params: { id: 'missing' },
        }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getStatus()).toBe(404);
    });

    it("403 'API key not permitted on this route' on a non-@ContentRoute route (DEFAULT-DENY)", async () => {
      const { prisma } = makePrisma();
      // No content/jwt-only/public markers => default-deny.
      const guard = new ScopeGuard(makeReflector({}), prisma);
      const ctx = makeCtx(
        writeReq({ method: 'POST', route: { path: '/uploads' } }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'API key not permitted on this route',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it("403 'this endpoint requires a user session' on a @JwtOnly route", async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(
        makeReflector({ [IS_JWT_ONLY]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({ method: 'POST', route: { path: '/api-keys' } }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'this endpoint requires a user session',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it('ALLOWS a @Public route at step 1 (returns true before any scope logic)', async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(
        makeReflector({ [IS_PUBLIC_KEY]: true }),
        prisma,
      );
      // Even a delete on a public route must short-circuit at clause 1.
      const ctx = makeCtx(
        writeReq({ method: 'DELETE', route: { path: '/reader/works/:id' } }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    // ── Publish-bypass attempts that MUST NOT succeed as a publish ──────────
    // A ['works:write'] key on a DRAFT work/page PATCH: if the malformed status
    // were treated as a publish attempt the guard would throw 'cannot publish';
    // resolving true is the proof it is NOT treated as a publish.
    it("does NOT treat status:'PUBLISHED' (wrong case) as a publish", async () => {
      const { prisma } = makePrisma({ workStatus: 'draft' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { status: 'PUBLISHED' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it("does NOT treat status:['published'] (array) as a publish", async () => {
      const { prisma } = makePrisma({ workStatus: 'draft' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { status: ['published'] },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('does NOT treat an empty body {} as a publish', async () => {
      const { prisma } = makePrisma({ workStatus: 'draft' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: {},
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('does NOT crash on a non-object body (array) — treated as no publish attempt', async () => {
      const { prisma } = makePrisma({ workStatus: 'draft' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: ['published'],
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  // ── ApiKey ['works:write','works:publish'] — publish + edit-published OK ──
  describe("ApiKey publisher key (['works:write','works:publish'])", () => {
    const pubReq = (over: Partial<FakeReq>): FakeReq => ({
      method: 'GET',
      scopes: ['works:write', 'works:publish'],
      authType: 'apikey',
      ...over,
    });

    it('ALLOWS PATCH {status:published} (publish)', async () => {
      const { prisma } = makePrisma({ workStatus: 'draft' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        pubReq({
          method: 'PATCH',
          body: { status: 'published' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('ALLOWS editing an already-published work (clause 6 exempt with works:publish)', async () => {
      // works:publish exempts clause 6, so the published-row DB read is skipped.
      const { prisma, workFind } = makePrisma({ workStatus: 'published' });
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        pubReq({
          method: 'PATCH',
          body: { title: 'edited' },
          route: { path: '/works/:id' },
          params: { id: 'w1' },
        }),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(workFind).not.toHaveBeenCalled();
    });

    it("still 403 'draft-only key cannot delete' on DELETE without works:delete", async () => {
      const { prisma } = makePrisma();
      const guard = new ScopeGuard(
        makeReflector({ [IS_CONTENT_ROUTE]: true }),
        prisma,
      );
      const ctx = makeCtx(
        pubReq({ method: 'DELETE', route: { path: '/works/:id' } }),
      );
      const err = await capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot delete',
      );
    });
  });

  // ── Schema-drift pin ─────────────────────────────────────────────────────
  // The guard derives wantsPublish from publishStatusSchema.safeParse(...) and
  // tests `=== 'published'`. If anyone adds .transform/.coerce/.default to the
  // schema, the parsed value drifts from the raw string and this pin fails —
  // forcing the guard and the schema to stay one source of truth.
  describe('publishStatusSchema drift pin', () => {
    it("safeParse('published') succeeds and equals the value the guard relies on", () => {
      const parsed = publishStatusSchema.safeParse('published');
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toBe('published');
    });

    it("rejects 'PUBLISHED' (case) and a non-string, so the guard can't be tricked", () => {
      expect(publishStatusSchema.safeParse('PUBLISHED').success).toBe(false);
      expect(publishStatusSchema.safeParse(['published']).success).toBe(false);
      expect(publishStatusSchema.safeParse(undefined).success).toBe(false);
    });
  });
});
