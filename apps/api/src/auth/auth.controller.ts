import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  CLIENT_HEADER,
  REFRESH_COOKIE_NAMES,
  loginRequestSchema,
  parseClientId,
  refreshCookieName,
  type AuthResponse,
  type AuthUser,
  type ClientId,
} from '@madiro/shared';
import type { CookieOptions, Request, Response } from 'express';

import type { Env } from '../config/env.validation';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { ClientHeaderGuard } from './guards/client-header.guard';
import { refreshCookieOptions } from './refresh-cookie';

/**
 * Rate limits are read here, not injected: a decorator runs at class-definition
 * time, long before the DI container exists. `env.validation` still declares
 * and validates both variables — this is the same value, read earlier.
 */
const LOGIN_LIMIT = Number(process.env.AUTH_LOGIN_RATE_LIMIT ?? 10);
const REFRESH_LIMIT = Number(process.env.AUTH_REFRESH_RATE_LIMIT ?? 20);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * The client header is required here too — not for CSRF (a login carries no
   * cookie to abuse) but because it names the app whose refresh cookie is
   * being issued. Defaulting it would put the scanner and the dashboard back
   * on one shared session; refusing it fails loudly instead of handing out a
   * cookie the client will never find again.
   */
  @Public()
  @UseGuards(ClientHeaderGuard)
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const { session, refreshToken } = await this.auth.login(
      parsed.data.login,
      parsed.data.password,
    );
    res.cookie(refreshCookieName(this.clientOf(req)), refreshToken, this.cookieOptions());
    return session;
  }

  /**
   * Renews the access token from the refresh cookie — no request body, because
   * the token is not something the client can read (audit S-H3). Every refresh
   * re-issues the cookie, so an active session slides forward instead of dying
   * 30 days after the last login.
   */
  @Public()
  @UseGuards(ClientHeaderGuard)
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: REFRESH_LIMIT, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const client = this.clientOf(req);
    const cookie = (req.cookies as Record<string, string | undefined> | undefined)?.[
      refreshCookieName(client)
    ];
    if (!cookie) {
      throw new UnauthorizedException('Сесію не знайдено');
    }
    const { session, refreshToken } = await this.auth.refresh(cookie);
    res.cookie(refreshCookieName(client), refreshToken, this.cookieOptions());
    return session;
  }

  /**
   * Drops the refresh cookie. Public on purpose: logging out has to work even
   * when the access token has already expired.
   */
  @Public()
  @UseGuards(ClientHeaderGuard)
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    const { maxAge: _maxAge, ...options } = this.cookieOptions();
    // Clear every client's cookie, not just the caller's: a session left
    // behind by an earlier single-cookie build would otherwise outlive a
    // deliberate logout, and clearing an absent cookie costs nothing.
    for (const name of REFRESH_COOKIE_NAMES) {
      res.clearCookie(name, options);
    }
  }

  // Any authenticated user (admin or seller) may read their own profile.
  @Roles('ADMIN', 'SELLER')
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /** Guaranteed by ClientHeaderGuard on every route that calls this. */
  private clientOf(req: Request): ClientId {
    return parseClientId(req.headers[CLIENT_HEADER])!;
  }

  private cookieOptions(): CookieOptions {
    return refreshCookieOptions({
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
      JWT_REFRESH_TTL: this.config.get('JWT_REFRESH_TTL', { infer: true }),
    });
  }
}
