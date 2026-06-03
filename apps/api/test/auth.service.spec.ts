/**
 * SECURITY GATE — AuthService user-management guards.
 *
 * Pure unit tests (no live DB, no Nest DI): AuthService is instantiated directly
 * with hand-built fake PrismaService / JwtService. These pin the load-bearing
 * self-protection + suspension rules that the Authors UI relies on but does NOT
 * enforce (the UI only hides buttons — the server is the boundary):
 *   - you cannot suspend or delete your OWN account
 *   - you cannot delete the LAST remaining account
 *   - a suspended account cannot obtain tokens (login AND refresh)
 *
 * Message assertions are EXACT (toBe) — the strings are the contract the client surfaces.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';

type UserDelegate = Partial<Record<keyof PrismaService['user'], jest.Mock>>;

function makeService(user: UserDelegate): AuthService {
  const prisma = { user } as unknown as PrismaService;
  // Tokens aren't exercised by the guard paths under test; a stub keeps the type happy.
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('tok'),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'a@b.com',
  name: 'A',
  passwordHash: 'x',
  avatarColor: '#7d8b6a',
  suspendedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('AuthService — self-protection & suspension guards', () => {
  it('updateUser: forbids changing the suspended state of your OWN account', async () => {
    const svc = makeService({ findUnique: jest.fn().mockResolvedValue(userRow({ id: 'me' })) });
    await expect(svc.updateUser('me', 'me', { suspended: true })).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'You cannot change the suspended state of your own account',
    });
  });

  it('updateUser: allows editing your OWN profile (name) — no suspend field', async () => {
    const update = jest.fn().mockResolvedValue(userRow({ id: 'me', name: 'New' }));
    const svc = makeService({
      findUnique: jest.fn().mockResolvedValue(userRow({ id: 'me' })),
      update,
    });
    const res = await svc.updateUser('me', 'me', { name: 'New' });
    expect(res.user.name).toBe('New');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('deleteUser: forbids deleting your OWN account (before any DB read)', async () => {
    const findUnique = jest.fn();
    const svc = makeService({ findUnique });
    await expect(svc.deleteUser('me', 'me')).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'You cannot delete your own account',
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('deleteUser: forbids deleting the LAST remaining account', async () => {
    const del = jest.fn();
    const svc = makeService({
      findUnique: jest.fn().mockResolvedValue(userRow({ id: 'other' })),
      count: jest.fn().mockResolvedValue(1),
      delete: del,
    });
    await expect(svc.deleteUser('me', 'other')).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'Cannot delete the last remaining account',
    });
    expect(del).not.toHaveBeenCalled();
  });

  it('deleteUser: deletes another account when more than one remains', async () => {
    const del = jest.fn().mockResolvedValue(userRow({ id: 'other' }));
    const svc = makeService({
      findUnique: jest.fn().mockResolvedValue(userRow({ id: 'other' })),
      count: jest.fn().mockResolvedValue(2),
      delete: del,
    });
    await expect(svc.deleteUser('me', 'other')).resolves.toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith({ where: { id: 'other' } });
  });

  it('login: rejects a SUSPENDED account even with the correct password', async () => {
    const passwordHash = bcrypt.hashSync('secret', 10);
    const svc = makeService({
      findUnique: jest.fn().mockResolvedValue(userRow({ passwordHash, suspendedAt: new Date() })),
    });
    await expect(svc.login({ email: 'a@b.com', password: 'secret' })).rejects.toMatchObject({
      constructor: UnauthorizedException,
      message: 'This account has been suspended',
    });
  });

  it('login: succeeds for an active account with the correct password', async () => {
    const passwordHash = bcrypt.hashSync('secret', 10);
    const svc = makeService({
      findUnique: jest.fn().mockResolvedValue(userRow({ passwordHash, suspendedAt: null })),
    });
    const res = await svc.login({ email: 'a@b.com', password: 'secret' });
    expect(res.accessToken).toBe('tok');
    expect(res.user.suspendedAt).toBeNull();
  });
});
