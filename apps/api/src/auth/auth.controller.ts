import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginDto } from './dto';

const REFRESH_COOKIE = 'bp_refresh';
const REFRESH_PATH = '/auth/refresh';

// Set and clear MUST share identical attributes (minus maxAge) or compliant browsers
// won't delete the cookie on logout. Keep them in one place so they can't drift.
function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: REFRESH_PATH,
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // No public self-signup. New accounts are created by an already-authenticated user
  // (the global JwtAuthGuard protects this route — there is no @Public() here).
  @Post('users')
  async createUser(@Body() dto: CreateUserDto) {
    return this.auth.createUser(dto);
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.auth.login(dto);
    setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await this.auth.refresh(token);
    setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    // Public: logout needs no identity and must work even after the access token expires.
    // Clear with the same options used to set the cookie so browsers actually delete it.
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { user: await this.auth.me(user.id) };
  }
}
