import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '@madiro/shared';

import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // Re-check against the DB: a deleted seller loses access immediately, and a
  // password change (which bumps tokenVersion) invalidates even an unexpired
  // access token.
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, name: true, login: true, role: true, tokenVersion: true },
    });
    if (!user || payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException();
    }
    const { tokenVersion: _tokenVersion, ...authUser } = user;
    return authUser;
  }
}
