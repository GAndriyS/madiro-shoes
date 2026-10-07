import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { CLIENT_HEADER, parseClientId } from '@madiro/shared';
import type { Request } from 'express';

/**
 * CSRF guard for the cookie-authenticated auth routes.
 *
 * `/auth/refresh` and `/auth/logout` are driven by the httpOnly refresh cookie.
 * The cookie is SameSite=Lax, which already keeps it off cross-site POSTs in
 * every current browser — this header is the guard that does not depend on
 * the browser: a form post or an <img> from another site cannot set a custom
 * header, and the CORS preflight it triggers only succeeds for our own
 * allowlisted origins.
 *
 * The header also names the calling app, which decides whose refresh cookie is
 * being renewed — so an unknown value is refused rather than defaulted.
 */
@Injectable()
export class ClientHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (parseClientId(request.headers[CLIENT_HEADER]) == null) {
      throw new ForbiddenException('Запит без клієнтського заголовка');
    }
    return true;
  }
}
