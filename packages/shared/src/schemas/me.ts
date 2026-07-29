import { z } from 'zod';

import { MATERIALS, PAYMENT_METHODS, SEASONS } from '../enums.js';
import { sizeSchema, tagCodeSchema } from './common.js';

/**
 * GET /me/summary — the scanner home card and profile badge (FR-S-02/03).
 * Today is computed in the store timezone (Europe/Kyiv).
 */
export const meSummarySchema = z.object({
  /** Net pairs sold today by this user: SALE count − RETURN count. */
  todaySalesPairs: z.number().int(),
  /** Net revenue today: Σ salePrice(SALE) − Σ salePrice(RETURN). */
  todaySalesTotal: z.number(),
  /** This user's intake drafts still awaiting a price. */
  draftsInQueue: z.number().int(),
});
export type MeSummary = z.infer<typeof meSummarySchema>;

/** GET /me/sales period — today or a whole month (FR-S-17). */
export const mySalesPeriodSchema = z.enum(['today', 'month']);
export type MySalesPeriod = z.infer<typeof mySalesPeriodSchema>;

/** A calendar month as `YYYY-MM`, interpreted in the store timezone. */
export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/**
 * GET /me/sales query. `month` applies only to `period=month`: absent it means
 * the current month (the original behaviour), present it selects that calendar
 * month and bounds the range on both sides.
 */
export const mySalesQuerySchema = z.object({
  period: mySalesPeriodSchema,
  month: monthKeySchema.optional(),
});
export type MySalesQuery = z.infer<typeof mySalesQuerySchema>;

/**
 * One row of the seller's own sales list. Informational only — no margins.
 * WRITEOFF rows are informational too (S-5): they carry no amount and never
 * count towards the period totals — the list stays about money, but a seller
 * can spot an accidental write-off and tell the admin.
 */
export const mySaleRowSchema = z.object({
  id: z.string(),
  type: z.enum(['SALE', 'RETURN', 'WRITEOFF']),
  style: tagCodeSchema,
  color: tagCodeSchema,
  size: sizeSchema,
  at: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  /** Signed: positive for a sale, negative for a return; null if priceless. */
  amount: z.number().nullable(),
});
export type MySaleRow = z.infer<typeof mySaleRowSchema>;

export const mySalesResponseSchema = z.object({
  /** Net pairs for the period: SALE count − RETURN count. */
  pairs: z.number().int(),
  /** Net revenue for the period. */
  total: z.number(),
  items: z.array(mySaleRowSchema),
});
export type MySalesResponse = z.infer<typeof mySalesResponseSchema>;

/** One of the seller's own intake pairs (FR-S-13): a draft or already confirmed. */
export const myDraftSchema = z.object({
  pairId: z.string(),
  style: tagCodeSchema,
  color: tagCodeSchema,
  size: sizeSchema,
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS),
  createdAt: z.string(),
  /** true → «очікує ціни» (editable/deletable); false → «на складі». */
  awaitingPrice: z.boolean(),
});
export type MyDraft = z.infer<typeof myDraftSchema>;

export const myDraftsResponseSchema = z.object({
  items: z.array(myDraftSchema),
});
export type MyDraftsResponse = z.infer<typeof myDraftsResponseSchema>;
