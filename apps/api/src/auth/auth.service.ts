import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { User as PrismaUser } from '@prisma/client';
import type { LoginInput, SignupInput, UpdateUserInput, User } from '@stockmaster/shared';
import { PrismaService } from '../prisma/prisma.service';

const AVATAR_COLORS = ['#7d8b6a', '#4f5bd5', '#c2683a', '#3f9b6b', '#2f7bf6', '#9a6dd7'];

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Create a new account. Used by the protected POST /auth/users endpoint — there is no
   * public self-signup. Deliberately issues NO tokens and sets no cookie: the signed-in
   * creator stays themselves; the new user signs in later with the password set here.
   */
  async createUser(input: SignupInput): Promise<{ user: User }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('That email is already registered');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const user = await this.prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash, avatarColor },
    });
    return { user: this.toUser(user) };
  }

  async login(input: LoginInput): Promise<{ user: User } & AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');
    // A suspended account cannot obtain new tokens (enforced here AND on refresh, so an
    // already-issued access token dies within its <=15m TTL once the user is suspended).
    if (user.suspendedAt) throw new UnauthorizedException('This account has been suspended');
    return { user: this.toUser(user), ...(await this.issueTokens(user)) };
  }

  async refresh(token: string | undefined): Promise<AuthTokens> {
    if (!token) throw new UnauthorizedException('Missing refresh token');
    let payload: { sub: string; email: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User no longer exists');
    if (user.suspendedAt) throw new UnauthorizedException('This account has been suspended');
    return this.issueTokens(user);
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toUser(user);
  }

  /**
   * Every account, oldest first — powers the Authors table. Returns only the public
   * `User` view (toUser strips passwordHash); this is a shared workspace, so any
   * signed-in member may list the team.
   */
  async listUsers(): Promise<User[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => this.toUser(u));
  }

  /**
   * Edit a member (name/email/password) and/or toggle suspension. `actingUserId` is the
   * signed-in caller — used to forbid self-suspension (which would lock yourself out).
   */
  async updateUser(actingUserId: string, targetId: string, input: UpdateUserInput): Promise<{ user: User }> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    if (input.suspended !== undefined && targetId === actingUserId) {
      throw new ForbiddenException('You cannot change the suspended state of your own account');
    }

    if (input.email && input.email !== target.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (clash) throw new ConflictException('That email is already registered');
    }

    const data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      suspendedAt?: Date | null;
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.password !== undefined) data.passwordHash = await bcrypt.hash(input.password, 10);
    if (input.suspended !== undefined) data.suspendedAt = input.suspended ? new Date() : null;

    const user = await this.prisma.user.update({ where: { id: targetId }, data });
    return { user: this.toUser(user) };
  }

  /**
   * Permanently delete a member. Their books/articles are kept (createdById → null via the
   * schema's onDelete: SetNull); their API keys cascade-delete. Guards against deleting
   * yourself (lock-out) or the last remaining account (an empty, unloginnable workspace).
   */
  async deleteUser(actingUserId: string, targetId: string): Promise<{ ok: true }> {
    if (targetId === actingUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    const total = await this.prisma.user.count();
    if (total <= 1) throw new ForbiddenException('Cannot delete the last remaining account');

    await this.prisma.user.delete({ where: { id: targetId } });
    return { ok: true };
  }

  private async issueTokens(user: PrismaUser): Promise<AuthTokens> {
    const payload = { sub: user.id, email: user.email };
    // `expiresIn` accepts a `ms` StringValue at runtime; cast the options to satisfy its narrow type.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      } as JwtSignOptions),
      this.jwt.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_TTL ?? '7d',
      } as JwtSignOptions),
    ]);
    return { accessToken, refreshToken };
  }

  private toUser(u: PrismaUser): User {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarColor: u.avatarColor,
      suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
