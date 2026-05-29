import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { User as PrismaUser } from '@prisma/client';
import type { LoginInput, SignupInput, User } from '@blockpress/shared';
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

  async signup(input: SignupInput): Promise<{ user: User } & AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('That email is already registered');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const user = await this.prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash, avatarColor },
    });
    return { user: this.toUser(user), ...(await this.issueTokens(user)) };
  }

  async login(input: LoginInput): Promise<{ user: User } & AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');
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
    return this.issueTokens(user);
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toUser(user);
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
      createdAt: u.createdAt.toISOString(),
    };
  }
}
