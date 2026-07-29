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
 * Pair lookup by the 5 identity fields (section 3.2). `undefined` = no filter.
 * Material additionally accepts an explicit `null` — "the combination with no
 * material specified" is a real thing to narrow to, and the pills need it.
 * Insulation has no such case: «Без утеплення» is the `NONE` value.
 */
export const pairLookupSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).nullable().optional(),
  season: z.enum(SEASONS).optional(),
});
export type PairLookupInput = z.infer<typeof pairLookupSchema>;

/**
 * One material/season combination actually present in stock for the scanned
 * style+color (rule 3.3 #5: offer only the combinations that really exist),
 * with the sizes available for it.
 */
export const saleComboSchema = z.object({
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS),
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
  season: z.enum(SEASONS),
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

/**
 * Reference stock search by style (FR-S-16): variants currently in stock with
 * per-size counts. Read-only for sellers — no prices of any kind.
 */
export const stockSearchResponseSchema = z.object({
  items: z.array(
    z.object({
      style: tagCodeSchema,
      color: tagCodeSchema,
      material: z.enum(MATERIALS).nullable(),
      season: z.enum(SEASONS),
      sizes: z.array(z.object({ size: sizeSchema, count: z.number().int().positive() })),
    }),
  ),
});
export type StockSearchResponse = z.infer<typeof stockSearchResponseSchema>;

/**
 * One material/insulation combination among the sold pairs that match the
 * scanned tag. The tag carries 3 of the 5 identity fields, so the same
 * style·color·size can belong to several variants (leather vs suede, fleece vs
 * none) — the seller narrows it down exactly as on checkout (rule 3.3 #5).
 */
export const returnComboSchema = z.object({
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS),
});
export type ReturnCombo = z.infer<typeof returnComboSchema>;

/**
 * Customer return lookup (FR-S-14): the scanned tag finds the most recent
 * sale of a matching sold pair (rule 3.3 #6). `combos` lists the combinations
 * that actually have a returnable sale; `sale` stays null while the choice is
 * ambiguous or nothing matches. No purchase prices here (FR-B-02).
 */
export const returnLookupResponseSchema = z.object({
  combos: z.array(returnComboSchema),
  sale: z
    .object({
      operationId: z.string(),
      pairId: z.string(),
      style: tagCodeSchema,
      color: tagCodeSchema,
      size: sizeSchema,
      material: z.enum(MATERIALS).nullable(),
      season: z.enum(SEASONS),
      salePrice: moneySchema,
      paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
      soldAt: z.string(),
      /** Whole days since the sale — the 14-day guideline is advisory only. */
      daysSince: z.number().int().min(0),
      sellerName: z.string(),
    })
    .nullable(),
});
export type ReturnLookupResponse = z.infer<typeof returnLookupResponseSchema>;

/** Registering a return pins the exact sale operation being reversed. */
export const returnSchema = z.object({
  operationId: z.string().min(1),
});
export type ReturnInput = z.infer<typeof returnSchema>;

/**
 * Purchase price hint for an intake in progress (FR-D-08, «підказка ціни»).
 * Keyed by the variant identity the admin is currently filling in, so the query
 * mirrors the find-or-create that the save will perform: same fields, same
 * defaults. Admin-only — this carries a purchase price (FR-B-02).
 */
export const priceHintQuerySchema = z.object({
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).optional(),
  season: z.enum(SEASONS).optional(),
});
export type PriceHintQuery = z.infer<typeof priceHintQuerySchema>;

/**
 * `purchasePrice` is the price this exact variant currently carries: a number,
 * `0` for «без ціни — старий товар», or null when the variant is new or has
 * never been priced — in which case the form stays empty and the admin decides.
 */
export const priceHintResponseSchema = z.object({
  // Plain number, not moneySchema: 0 is «без ціни — старий товар», and
  // moneySchema is positive-only (same reason the other read paths do this).
  purchasePrice: z.number().nullable(),
});
export type PriceHintResponse = z.infer<typeof priceHintResponseSchema>;

/** Setting a variant's purchase price from the queue (FR-D-08); null = "no price — old stock". */
export const setPurchasePriceSchema = z.object({
  variantId: z.string().min(1),
  purchasePrice: moneySchema.nullable(),
});
export type SetPurchasePriceInput = z.infer<typeof setPurchasePriceSchema>;
