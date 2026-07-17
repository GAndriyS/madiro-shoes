import { SetMetadata } from '@nestjs/common';
import type { Role } from '@madiro/shared';

export const ROLES_KEY = 'roles';

/** Обмежує ендпоінт переліченими ролями; без декоратора достатньо валідного JWT. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
