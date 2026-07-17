import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser, Role } from '@madiro/shared';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard (fail-closed)', () => {
  const build = (meta: { public?: boolean; roles?: Role[]; user?: AuthUser | null }) => {
    const reflector = {
      getAllAndOverride: (key: unknown) =>
        key === IS_PUBLIC_KEY ? meta.public : key === ROLES_KEY ? meta.roles : undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: meta.user ?? undefined }) }),
    } as unknown as ExecutionContext;
    return guard.canActivate(ctx);
  };

  const admin: AuthUser = { id: 'a', name: 'A', login: 'admin', role: 'ADMIN' };
  const seller: AuthUser = { id: 's', name: 'S', login: 'olia', role: 'SELLER' };

  it('дозволяє @Public маршрути без користувача', () => {
    expect(build({ public: true })).toBe(true);
  });

  it('ДЕНАЙ протектед-маршруту без @Roles (fail closed)', () => {
    expect(build({ roles: undefined, user: admin })).toBe(false);
    expect(build({ roles: [], user: admin })).toBe(false);
  });

  it('пускає лише дозволену роль', () => {
    expect(build({ roles: ['ADMIN'], user: admin })).toBe(true);
    expect(build({ roles: ['ADMIN'], user: seller })).toBe(false);
  });

  it('@Roles(ADMIN, SELLER) = будь-який автентифікований', () => {
    expect(build({ roles: ['ADMIN', 'SELLER'], user: seller })).toBe(true);
    expect(build({ roles: ['ADMIN', 'SELLER'], user: null })).toBe(false);
  });
});
