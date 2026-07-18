import { z } from 'zod';

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
