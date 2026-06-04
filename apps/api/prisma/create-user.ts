import * as readline from 'readline';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { signupSchema } from '@stockmaster/shared';
import { ZodError } from 'zod';

// Mirrors auth.service: the fixed avatar palette + bcrypt cost. Kept in sync so a
// bootstrapped account is indistinguishable from one minted via POST /auth/users.
const AVATAR_COLORS = ['#7d8b6a', '#4f5bd5', '#c2683a', '#3f9b6b', '#2f7bf6', '#9a6dd7'];
const BCRYPT_COST = 10;

/**
 * Pure, testable core: validate `input` with the SAME schema the API uses, reject a
 * duplicate email, then hash + create. Throws ZodError on bad input and a plain Error
 * ('That email is already registered') on a clash — identical rules to
 * AuthService.createUser, minus the Nest DI. Returns the created user row.
 */
export async function createUserRecord(prisma: PrismaClient, input: unknown) {
  const { email, name, password } = signupSchema.parse(input);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('That email is already registered');
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  return prisma.user.create({ data: { email, name, passwordHash, avatarColor } });
}

// ── Orchestration (testable: takes a PromptIO, never touches readline) ──────────

export interface PromptIO {
  /** Visible prompt → the entered line. */
  ask(query: string): Promise<string>;
  /** Hidden prompt (input masked) → the entered line. */
  askHidden(query: string): Promise<string>;
}

/**
 * Gather the four fields, enforce the password confirmation, then create. Throws on a
 * mismatch (BEFORE any DB call), on validation (ZodError), or on a duplicate email.
 * Pure orchestration — no console, no process.exit — so it is unit-testable with a fake IO.
 */
export async function run(io: PromptIO, prisma: PrismaClient) {
  const email = (await io.ask('Email:    ')).trim();
  const name = (await io.ask('Name:     ')).trim();
  const password = await io.askHidden('Password: ');
  const confirm = await io.askHidden('Confirm:  ');
  if (password !== confirm) throw new Error('Passwords do not match');
  return createUserRecord(prisma, { email, name, password });
}

// ── readline adapter + entry point (thin I/O; not unit-tested) ──────────────────

function ask(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

/** Prompt without echoing keystrokes — masks typed characters with '*'. */
function askHidden(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    const rlAny = rl as unknown as {
      stdoutMuted: boolean;
      _writeToOutput: (s: string) => void;
      output: NodeJS.WritableStream;
      history?: string[];
    };
    rlAny._writeToOutput = (stringToWrite: string) => {
      rlAny.output.write(rlAny.stdoutMuted ? '*' : stringToWrite);
    };
    rl.question(query, (answer) => {
      rlAny.stdoutMuted = false;
      rlAny.output.write('\n');
      // Keep the secret out of readline's in-memory history.
      if (Array.isArray(rlAny.history)) rlAny.history = rlAny.history.slice(1);
      resolve(answer);
    });
    rlAny.stdoutMuted = true;
  });
}

async function main(): Promise<void> {
  // Without a TTY the prompts can't be driven and readline would exit silently with no user
  // created — the worst outcome for a one-shot bootstrap. Fail loudly instead. (This is why a
  // containerized run needs `-it`.)
  if (!process.stdin.isTTY) {
    console.error(
      'create-user must run in an interactive terminal (it prompts for input).\n' +
        'In Docker, allocate a TTY, e.g.:\n' +
        '  docker compose run -it --rm app-init pnpm -C apps/api create-user',
    );
    process.exitCode = 1;
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prisma = new PrismaClient();
  const io: PromptIO = {
    ask: (q) => ask(rl, q),
    askHidden: (q) => askHidden(rl, q),
  };
  try {
    const user = await run(io, prisma);
    console.log(`✓ created ${user.email}`);
  } catch (err) {
    if (err instanceof ZodError) {
      console.error('✗ Invalid input:');
      for (const issue of err.issues) {
        console.error(`  - ${issue.path.join('.') || 'value'}: ${issue.message}`);
      }
    } else {
      console.error(`✗ ${(err as Error).message}`);
    }
    process.exitCode = 1;
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// Only run the prompts when executed directly (so the test can import the core).
if (require.main === module) {
  void main();
}
