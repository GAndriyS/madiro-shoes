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

/** GET /me/sales period — today or the current month (FR-S-17). */
export const mySalesPeriodSchema = z.enum(['today', 'month']);
export type MySalesPeriod = z.infer<typeof mySalesPeriodSchema>;

/** One row of the seller's own sales list. Informational only — no margins. */
export const mySaleRowSchema = z.object({
  id: z.string(),
  type: z.enum(['SALE', 'RETURN']),
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
  season: z.enum(SEASONS).nullable(),
  createdAt: z.string(),
  /** true → «очікує ціни» (editable/deletable); false → «на складі». */
  awaitingPrice: z.boolean(),
});
export type MyDraft = z.infer<typeof myDraftSchema>;

export const myDraftsResponseSchema = z.object({
  items: z.array(myDraftSchema),
});
export type MyDraftsResponse = z.infer<typeof myDraftsResponseSchema>;
