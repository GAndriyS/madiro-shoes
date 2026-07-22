import { z } from 'zod';

import { MATERIALS, PAIR_STATUSES, PAYMENT_METHODS, SEASONS } from '../enums.js';
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

/**
 * Editing an own draft awaiting price (FR-S-13): the same five identity fields
 * a seller enters on intake — never the price.
 */
export const draftUpdateSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).optional(),
  season: z.enum(SEASONS).optional(),
});
export type DraftUpdateInput = z.infer<typeof draftUpdateSchema>;

/** Result of a successful intake — no price fields, so it is safe for sellers. */
export const intakeResultSchema = z.object({
  pairId: z.string(),
  variantId: z.string(),
  size: sizeSchema,
  status: z.enum(PAIR_STATUSES),
  awaitingPrice: z.boolean(),
});
export type IntakeResult = z.infer<typeof intakeResultSchema>;

/**
 * Pair lookup by the 5 identity fields (section 3.2). For material/season,
 * `undefined` = no filter, explicit `null` = "the combination without a value"
 * (variants created before the field existed) — the narrowing pills need both.
 */
export const pairLookupSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).nullable().optional(),
  season: z.enum(SEASONS).nullable().optional(),
});
export type PairLookupInput = z.infer<typeof pairLookupSchema>;

/**
 * One material/season combination actually present in stock for the scanned
 * style+color (rule 3.3 #5: offer only the combinations that really exist),
 * with the sizes available for it.
 */
export const saleComboSchema = z.object({
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS).nullable(),
  sizes: z.array(sizeSchema),
});
export type SaleCombo = z.infer<typeof saleComboSchema>;

/** The FIFO candidate pair shown on the found-pair card (FR-S-07). Seller-safe. */
export const foundPairSchema = z.object({
  pairId: z.string(),
  style: tagCodeSchema,
  color: tagCodeSchema,
  size: sizeSchema,
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS).nullable(),
  intakeDate: z.string(),
  awaitingPrice: z.boolean(),
});
export type FoundPair = z.infer<typeof foundPairSchema>;

/**
 * Scan-to-sell lookup response (FR-S-06/09). `pair` is null when nothing in
 * stock matches — then `similar` fills the «Схожі на складі» block. The sale
 * price hint is the variant's last sale (rule 3.3 #9). No purchase prices here.
 */
export const saleLookupResponseSchema = z.object({
  combos: z.array(saleComboSchema),
  pair: foundPairSchema.nullable(),
  salePriceHint: moneySchema.nullable(),
  similar: z.array(
    z.object({
      style: tagCodeSchema,
      color: tagCodeSchema,
      size: sizeSchema,
      count: z.number().int().positive(),
    }),
  ),
});
export type SaleLookupResponse = z.infer<typeof saleLookupResponseSchema>;

/** Sale (FR-S-07): the final price is entered on every sale. */
export const saleSchema = z.object({
  pairId: z.string().min(1),
  salePrice: moneySchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
});
export type SaleInput = z.infer<typeof saleSchema>;

/**
 * Result of a checkout (sale or write-off) — drives the success toast.
 * Purchase price/margin never appear here (FR-B-02).
 */
export const checkoutResultSchema = z.object({
  pairId: z.string(),
  style: tagCodeSchema,
  color: tagCodeSchema,
  size: sizeSchema,
  status: z.enum(PAIR_STATUSES),
  salePrice: moneySchema.nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
});
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

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
