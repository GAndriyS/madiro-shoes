import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  loginRequestSchema,
  refreshRequestSchema,
  type AuthResponse,
  type AuthUser,
} from '@madiro/shared';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() body: unknown): Promise<AuthResponse> {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.auth.login(parsed.data.login, parsed.data.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() body: unknown): Promise<AuthResponse> {
    const parsed = refreshRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.auth.refresh(parsed.data.refreshToken);
  }

  // Any authenticated user (admin or seller) may read their own profile.
  @Roles('ADMIN', 'SELLER')
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
