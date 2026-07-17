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

  // Звіряємося з БД: видалений продавець втрачає доступ одразу,
  // навіть із ще живим access-токеном.
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, name: true, login: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
