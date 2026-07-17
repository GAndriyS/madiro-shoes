import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { AuthResponse, AuthUser, Role } from '@madiro/shared';

import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

interface RefreshTokenPayload {
  sub: string;
  tokenType: 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // The same account serves the scanner and the dashboard; deleted sellers cannot log in.
  async login(login: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findFirst({
      where: { login, deletedAt: null },
    });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Невірний логін або пароль');
    }
    // Fire-and-forget: activity timestamp must not delay or fail the login
    void this.prisma.user
      .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
      .catch(() => undefined);
    return this.buildAuthResponse({
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.role,
    });
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Недійсний refresh-токен');
    }
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Недійсний refresh-токен');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, name: true, login: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Користувача не знайдено');
    }
    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: AuthUser): Promise<AuthResponse> {
    const accessPayload: AccessTokenPayload = { sub: user.id, role: user.role };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, tokenType: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL', '15m') as JwtSignOptions['expiresIn'],
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL', '30d') as JwtSignOptions['expiresIn'],
      }),
    ]);

    return { accessToken, refreshToken, user };
  }
}
