/**
 * Bootstrap user-creation — core logic (createUserRecord). The interactive prompt
 * shell in prisma/create-user.ts is thin I/O and is not unit-tested; this pins the
 * security-relevant parts: same validation as the API (shared signupSchema), bcrypt
 * hashing (never the plaintext), a palette avatarColor, and refuse-if-exists.
 */
import * as bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { createUserRecord, run, type PromptIO } from '../prisma/create-user';

// The fixed palette from auth.service — userSchema enforces strict #rrggbb.
const AVATAR_PALETTE = ['#7d8b6a', '#4f5bd5', '#c2683a', '#3f9b6b', '#2f7bf6', '#9a6dd7'];

function makePrisma(parts: { findUnique?: jest.Mock; create?: jest.Mock }): PrismaClient {
  return {
    user: {
      findUnique: parts.findUnique ?? jest.fn(),
      create: parts.create ?? jest.fn(),
    },
  } as unknown as PrismaClient;
}

const validInput = { email: 'admin@acme.com', name: 'Jane Admin', password: 'sup3rsecret' };

describe('createUserRecord (bootstrap account creation)', () => {
  it('creates a user with a bcrypt-hashed password and a palette avatarColor', async () => {
    const create = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u1', createdAt: new Date(), ...data }),
    );
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = makePrisma({ findUnique, create });

    const user = await createUserRecord(prisma, validInput);

    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'admin@acme.com' } });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    // The plaintext is never stored; the stored hash must verify against it.
    expect(data.passwordHash).not.toBe(validInput.password);
    expect(bcrypt.compareSync(validInput.password, data.passwordHash)).toBe(true);
    expect(AVATAR_PALETTE).toContain(data.avatarColor);
    expect(data.email).toBe('admin@acme.com');
    expect(data.name).toBe('Jane Admin');
    expect(user.email).toBe('admin@acme.com');
  });

  it('refuses to overwrite an existing email (no create)', async () => {
    const create = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({ id: 'existing' });
    const prisma = makePrisma({ findUnique, create });

    await expect(createUserRecord(prisma, validInput)).rejects.toThrow(
      'That email is already registered',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before touching the DB (ZodError)', async () => {
    const findUnique = jest.fn();
    const create = jest.fn();
    const prisma = makePrisma({ findUnique, create });

    await expect(
      createUserRecord(prisma, { ...validInput, email: 'not-an-email' }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 chars (ZodError, no create)', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn();
    const prisma = makePrisma({ findUnique, create });

    await expect(
      createUserRecord(prisma, { ...validInput, password: 'short' }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(create).not.toHaveBeenCalled();
  });
});

/** Feed scripted answers to the prompt orchestration, in order (ask + askHidden share the queue). */
function fakeIO(answers: string[]): PromptIO {
  let i = 0;
  const next = async () => answers[i++];
  return { ask: next, askHidden: next };
}

describe('run (prompt orchestration)', () => {
  it('creates the user when the password confirmation matches', async () => {
    const create = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u1', createdAt: new Date(), ...data }),
    );
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(null), create });

    const user = await run(fakeIO(['admin@acme.com', 'Jane Admin', 'sup3rsecret', 'sup3rsecret']), prisma);

    expect(user.email).toBe('admin@acme.com');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('aborts BEFORE any DB call when the confirmation does not match', async () => {
    const findUnique = jest.fn();
    const create = jest.fn();
    const prisma = makePrisma({ findUnique, create });

    await expect(
      run(fakeIO(['admin@acme.com', 'Jane Admin', 'sup3rsecret', 'typo-mismatch']), prisma),
    ).rejects.toThrow('Passwords do not match');
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace on email and name (passwords are left verbatim)', async () => {
    const create = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u1', createdAt: new Date(), ...data }),
    );
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(null), create });

    await run(fakeIO(['  admin@acme.com  ', '  Jane Admin  ', 'sup3rsecret', 'sup3rsecret']), prisma);

    const data = create.mock.calls[0][0].data;
    expect(data.email).toBe('admin@acme.com');
    expect(data.name).toBe('Jane Admin');
  });
});
