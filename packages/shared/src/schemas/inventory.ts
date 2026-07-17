import { z } from 'zod';

import { MATERIALS, PAYMENT_METHODS, SEASONS } from '../enums.js';
import { moneySchema, sizeSchema, tagCodeSchema } from './common.js';

/**
 * Pair intake (FR-S-11/12): three tag fields plus optional material and
 * insulation. Only the admin sets the purchase price; a seller creates a draft.
 */
export const intakeSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).optional(),
  season: z.enum(SEASONS).optional(),
  /** Admin only; explicit null means "no price — old stock". */
  purchasePrice: moneySchema.nullable().optional(),
});
export type IntakeInput = z.infer<typeof intakeSchema>;

/** Pair lookup by the 5 identity fields (section 3.2). */
export const pairLookupSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).optional(),
  season: z.enum(SEASONS).optional(),
});
export type PairLookupInput = z.infer<typeof pairLookupSchema>;

/** Sale (FR-S-07): the final price is entered on every sale. */
export const saleSchema = z.object({
  pairId: z.string().min(1),
  salePrice: moneySchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
});
export type SaleInput = z.infer<typeof saleSchema>;

/** Write-off (FR-S-08): no price, optional reason comment. */
export const writeoffSchema = z.object({
  pairId: z.string().min(1),
  comment: z.string().trim().max(500).optional(),
});
export type WriteoffInput = z.infer<typeof writeoffSchema>;

/** Setting a variant's purchase price from the queue (FR-D-08); null = "no price — old stock". */
export const setPurchasePriceSchema = z.object({
  variantId: z.string().min(1),
  purchasePrice: moneySchema.nullable(),
});
export type SetPurchasePriceInput = z.infer<typeof setPurchasePriceSchema>;
