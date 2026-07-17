import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Вимикає глобальний JwtAuthGuard для ендпоінта (логін, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
