export const ROLES = ['ADMIN', 'SELLER'] as const;
export type Role = (typeof ROLES)[number];

export const MATERIALS = ['LEATHER', 'SUEDE'] as const;
export type Material = (typeof MATERIALS)[number];

/**
 * Internal field name is "season"; every UI labels it «Утеплення»
 * (none / fleece / sheepskin) — see requirements-analysis, section 3.1.
 */
export const SEASONS = ['NONE', 'BAIKA', 'SHEEPSKIN'] as const;
export type Season = (typeof SEASONS)[number];

export const PAIR_STATUSES = ['IN_STOCK', 'SOLD', 'WRITTEN_OFF'] as const;
export type PairStatus = (typeof PAIR_STATUSES)[number];

export const OPERATION_TYPES = ['INTAKE', 'SALE', 'RETURN', 'WRITEOFF'] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
