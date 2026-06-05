/**
 * SECURITY GATE — ScopeGuard unit tests.
 *
 * These pin the full per-route enforcement contract. They are pure unit tests:
 * the guard is instantiated directly with a hand-built Reflector + a fake
 * ExecutionContext. There is NO live DB and NO Nest DI container — under content
 * versioning the guard no longer reads the DB at all (see clause-6 note below).
 *
 * The decision order under test (FIXED, security-load-bearing):
 *   1. @Public route               -> allow
 *   2. wildcard scope ['*'] (JWT)  -> allow (backward-compat bypass)
 *   3. @JwtOnly route              -> 403
 *   4. NOT a @ContentRoute         -> 403 (DEFAULT-DENY)
 *   5. publish-transition / delete -> 403 unless content:publish / content:delete
 *
 * Clause 6 (the old "cannot edit already-published content" block) was REMOVED
 * with content versioning: the live tree is now a PRIVATE working draft (the
 * public is served the frozen snapshot), so a content:write key editing it
 * changes nothing public. Publishing — the only public transition — stays gated
 * at clause 5. The tests below assert that relaxation explicitly.
 *
 * Assertions on the 403 messages are EXACT (toBe, not substring), because the
 * literal strings are the contract the MCP client surfaces verbatim.
 */
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { publishStatusSchema } from '@stockmaster/shared';
import { ScopeGuard } from '../src/common/guards/scope.guard';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import {
  IS_CONTENT_ROUTE,
  IS_JWT_ONLY,
} from '../src/common/decorators/scopes.decorator';

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

/** Run canActivate (now synchronous) and capture the thrown error (or null). */
function capture(guard: ScopeGuard, ctx: ExecutionContext): unknown {
  try {
    guard.canActivate(ctx);
    return null;
  } catch (e) {
    return e;
  }
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

    it('allows PATCH body{status:published} (publish)', () => {
      const guard = new ScopeGuard(makeReflector({}));
      const ctx = makeCtx(
        jwtReq({
          method: 'PATCH',
          body: { status: 'published' },
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows DELETE /books/:id', () => {
      const guard = new ScopeGuard(makeReflector({}));
      const ctx = makeCtx(
        jwtReq({ method: 'DELETE', route: { path: '/books/:id' } }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows DELETE /pages/:id', () => {
      const guard = new ScopeGuard(makeReflector({}));
      const ctx = makeCtx(
        jwtReq({ method: 'DELETE', route: { path: '/pages/:id' } }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows DELETE /chapters/:id', () => {
      const guard = new ScopeGuard(makeReflector({}));
      const ctx = makeCtx(
        jwtReq({ method: 'DELETE', route: { path: '/chapters/:id' } }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows PATCH on an already-published book (regression — JWT unaffected)', () => {
      const guard = new ScopeGuard(makeReflector({}));
      const ctx = makeCtx(
        jwtReq({
          method: 'PATCH',
          body: { title: 'new title' },
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  // ── ApiKey ['content:write'] — the draft-only key ─────────────────────────
  describe("ApiKey draft-only key (['content:write'])", () => {
    const writeReq = (over: Partial<FakeReq>): FakeReq => ({
      method: 'GET',
      scopes: ['content:write'],
      authType: 'apikey',
      ...over,
    });

    it("403 'draft-only key cannot publish' on PATCH {status:published}", () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { status: 'published' },
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      const err = capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot publish',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it.each([
      ['/books/:id/publish'],
      ['/books/:id/unpublish'],
      ['/books/:id/versions/:versionId/restore'],
      ['/articles/:id/publish'],
      ['/articles/:id/unpublish'],
      ['/articles/:id/versions/:versionId/restore'],
    ])(
      "403 'draft-only key cannot publish' on POST %s (versioning routes need content:publish)",
      (path) => {
        const guard = new ScopeGuard(
          makeReflector({ [IS_CONTENT_ROUTE]: true }),
        );
        const ctx = makeCtx(
          writeReq({ method: 'POST', route: { path }, params: { id: 'w1' } }),
        );
        const err = capture(guard, ctx);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).message).toBe(
          'draft-only key cannot publish',
        );
        expect((err as ForbiddenException).getStatus()).toBe(403);
      },
    );

    it("403 'draft-only key cannot delete' on DELETE /books/:id", () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({ method: 'DELETE', route: { path: '/books/:id' } }),
      );
      const err = capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot delete',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it("403 'draft-only key cannot delete' on DELETE /articles/:id", () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({ method: 'DELETE', route: { path: '/articles/:id' } }),
      );
      const err = capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'draft-only key cannot delete',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    // ── Clause-6 relaxation: editing a DRAFT is always allowed ───────────────
    // Under versioning the live tree is private, so a content:write key may edit
    // it whether or not the work has a published version. These would have 403'd
    // before; now they must pass.
    it.each([
      ['/books/:id'],
      ['/articles/:id'],
      ['/pages/:id'],
    ])('ALLOWS PATCH title on %s regardless of published state', (path) => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { title: 'edited' },
          route: { path },
          params: { id: 'x1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("403 'API key not permitted on this route' on a non-@ContentRoute route (DEFAULT-DENY)", () => {
      // No content/jwt-only/public markers => default-deny.
      const guard = new ScopeGuard(makeReflector({}));
      const ctx = makeCtx(
        writeReq({ method: 'POST', route: { path: '/uploads' } }),
      );
      const err = capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'API key not permitted on this route',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it("403 'this endpoint requires a user session' on a @JwtOnly route", () => {
      const guard = new ScopeGuard(makeReflector({ [IS_JWT_ONLY]: true }));
      const ctx = makeCtx(
        writeReq({ method: 'POST', route: { path: '/api-keys' } }),
      );
      const err = capture(guard, ctx);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe(
        'this endpoint requires a user session',
      );
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });

    it('ALLOWS a @Public route at step 1 (returns true before any scope logic)', () => {
      const guard = new ScopeGuard(makeReflector({ [IS_PUBLIC_KEY]: true }));
      // Even a delete on a public route must short-circuit at clause 1.
      const ctx = makeCtx(
        writeReq({ method: 'DELETE', route: { path: '/reader/books/:id' } }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    // ── Publish-bypass attempts that MUST NOT succeed as a publish ──────────
    // A ['content:write'] key on a PATCH: if the malformed status were treated as
    // a publish attempt the guard would throw 'cannot publish'; resolving true is
    // the proof it is NOT treated as a publish (and editing the draft is allowed).
    it("does NOT treat status:'PUBLISHED' (wrong case) as a publish", () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { status: 'PUBLISHED' },
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("does NOT treat status:['published'] (array) as a publish", () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: { status: ['published'] },
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('does NOT treat an empty body {} as a publish', () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: {},
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('does NOT crash on a non-object body (array) — treated as no publish attempt', () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        writeReq({
          method: 'PATCH',
          body: ['published'],
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  // ── ApiKey ['content:write','content:publish'] — publish + edit OK ──────────
  describe("ApiKey publisher key (['content:write','content:publish'])", () => {
    const pubReq = (over: Partial<FakeReq>): FakeReq => ({
      method: 'GET',
      scopes: ['content:write', 'content:publish'],
      authType: 'apikey',
      ...over,
    });

    it('ALLOWS PATCH {status:published} (publish)', () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        pubReq({
          method: 'PATCH',
          body: { status: 'published' },
          route: { path: '/books/:id' },
          params: { id: 'w1' },
        }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it.each([
      ['/books/:id/publish'],
      ['/books/:id/unpublish'],
      ['/books/:id/versions/:versionId/restore'],
      ['/articles/:id/publish'],
    ])('ALLOWS POST %s with content:publish', (path) => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        pubReq({ method: 'POST', route: { path }, params: { id: 'w1' } }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("still 403 'draft-only key cannot delete' on DELETE without content:delete", () => {
      const guard = new ScopeGuard(makeReflector({ [IS_CONTENT_ROUTE]: true }));
      const ctx = makeCtx(
        pubReq({ method: 'DELETE', route: { path: '/books/:id' } }),
      );
      const err = capture(guard, ctx);
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
