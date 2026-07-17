import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, Role } from '@madiro/shared';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Fail-closed role guard: every protected route must declare its allowed roles
 * with @Roles. A non-@Public route without @Roles is denied — so a forgotten
 * annotation on a future pricing endpoint fails loudly (403) instead of
 * silently leaking purchase prices/margins to sellers (see docs/audit-2026-07).
 * Use @Roles('ADMIN', 'SELLER') for "any authenticated user".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return false;
    }
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    return user != null && required.includes(user.role);
  }
}
