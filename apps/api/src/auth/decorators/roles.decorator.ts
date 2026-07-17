import { SetMetadata } from '@nestjs/common';
import type { Role } from '@madiro/shared';

export const ROLES_KEY = 'roles';

/** Restricts an endpoint to the listed roles; without it a valid JWT is enough. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
