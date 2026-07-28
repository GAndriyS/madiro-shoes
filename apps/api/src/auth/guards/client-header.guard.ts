import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { CLIENT_HEADER } from '@madiro/shared';
import type { Request } from 'express';

/**
 * CSRF guard for the cookie-authenticated auth routes.
 *
 * `/auth/refresh` and `/auth/logout` are driven by the httpOnly refresh cookie,
 * which the browser attaches to cross-site requests too (SameSite=None in
 * production). Requiring a custom header blocks that: a form post or an <img>
 * from another site cannot set one, and the CORS preflight it triggers only
 * succeeds for our own allowlisted origins.
 */
@Injectable()
export class ClientHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers[CLIENT_HEADER] == null) {
      throw new ForbiddenException('Запит без клієнтського заголовка');
    }
    return true;
  }
}
