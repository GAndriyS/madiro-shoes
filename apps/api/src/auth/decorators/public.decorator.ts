import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Disables the global JwtAuthGuard for an endpoint (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
