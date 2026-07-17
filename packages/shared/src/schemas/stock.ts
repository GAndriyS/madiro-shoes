import { z } from 'zod';

import { MATERIALS, OPERATION_TYPES, PAYMENT_METHODS, SEASONS } from '../enums.js';
import { moneySchema } from './common.js';

/** Stock list query (FR-D-06): search, filter chips, sort, server-side pagination. */
export const stockListQuerySchema = z.object({
  search: z.string().trim().max(40).optional(),
  material: z.enum(MATERIALS).optional(),
  season: z.enum(SEASONS).optional(),
  /** Chip «Очікують ціни» — variants with drafts in the queue. */
  awaitingPrice: z.coerce.boolean().optional(),
  /** Chip «Залишок ≤ 2». */
  lowStock: z.coerce.boolean().optional(),
  size: z.coerce.number().int().optional(),
  sort: z.enum(['style-asc', 'style-desc']).default('style-asc'),
  page: z.coerce.number().int().min(1).default(1),
});
export type StockListQuery = z.infer<typeof stockListQuerySchema>;

/** Table row = variant (FR-D-06). */
export const stockVariantRowSchema = z.object({
  id: z.string(),
  style: z.string(),
  color: z.string(),
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS).nullable(),
  /** Distinct sizes currently in stock (chips). */
  sizes: z.array(z.number().int()),
  /** Pairs in the "awaiting price" queue for this variant (amber chip). */
  awaitingPriceCount: z.number().int(),
  pairsCount: z.number().int(),
  purchasePrice: z.number().nullable(),
  lastSalePrice: z.number().nullable(),
});
export type StockVariantRow = z.infer<typeof stockVariantRowSchema>;

export const stockListResponseSchema = z.object({
  items: z.array(stockVariantRowSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  /** Header line: «412 пар · 57 моделей · 486 900 ₴ у закупці». */
  summary: z.object({
    pairsTotal: z.number().int(),
    variantsTotal: z.number().int(),
    purchaseValue: z.number(),
  }),
  /** Variants with queue drafts (chip label and nav badge). */
  queueVariants: z.number().int(),
});
export type StockListResponse = z.infer<typeof stockListResponseSchema>;

/** Variant card / drawer (FR-D-07). */
export const variantPairSchema = z.object({
  id: z.string(),
  size: z.number().int(),
  intakeDate: z.string(),
  awaitingPrice: z.boolean(),
});
export type VariantPair = z.infer<typeof variantPairSchema>;

export const variantHistoryEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  type: z.enum(OPERATION_TYPES),
  sizes: z.array(z.number().int()),
  /** Sale/return amount; for intake — the historical purchase price; null — draft. */
  amount: z.number().nullable(),
  actorName: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
});
export type VariantHistoryEntry = z.infer<typeof variantHistoryEntrySchema>;

export const variantDetailSchema = z.object({
  id: z.string(),
  style: z.string(),
  color: z.string(),
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS).nullable(),
  purchasePrice: z.number().nullable(),
  lastSalePrice: z.number().nullable(),
  soldLast30Days: z.number().int(),
  pairs: z.array(variantPairSchema),
  history: z.array(variantHistoryEntrySchema),
});
export type VariantDetail = z.infer<typeof variantDetailSchema>;

/** PATCH /stock/variants/:id/price — one price for every size of the variant (FR-D-08). */
export const setVariantPriceSchema = z.object({
  purchasePrice: moneySchema,
});
export type SetVariantPriceInput = z.infer<typeof setVariantPriceSchema>;
