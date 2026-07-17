import { z } from 'zod';

import { OPERATION_TYPES, PAYMENT_METHODS } from '../enums.js';

/** Overview periods (FR-D-02): today / week / month / custom range. */
export const overviewPeriodSchema = z.enum(['today', 'week', 'month', 'custom']);
export type OverviewPeriod = z.infer<typeof overviewPeriodSchema>;

const isoDateTime = z.string().min(1);

export const queueItemSchema = z.object({
  pairId: z.string(),
  style: z.string(),
  color: z.string(),
  size: z.number().int(),
  sellerName: z.string(),
  createdAt: isoDateTime,
  /** The pair was sold before pricing (special case of FR-D-11). */
  soldAt: isoDateTime.nullable(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const recentOperationSchema = z.object({
  id: z.string(),
  type: z.enum(OPERATION_TYPES),
  style: z.string(),
  color: z.string(),
  size: z.number().int(),
  at: isoDateTime,
  sellerName: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  /** Operation amount; negative for a return; null — a draft without a price. */
  amount: z.number().nullable(),
  /** Margin; null — not computed (no purchase price, or an intake). */
  margin: z.number().nullable(),
  isDraft: z.boolean(),
});
export type RecentOperation = z.infer<typeof recentOperationSchema>;

/** GET /stats/overview response — the whole Overview screen in one request. */
export const overviewResponseSchema = z.object({
  revenue: z.number(),
  /** Comparison with the previous period; null — hidden. */
  revenueDeltaPct: z.number().nullable(),
  sales: z.number().int(),
  returns: z.number().int(),
  netPairs: z.number().int(),
  margin: z.number(),
  marginPctOfRevenue: z.number().nullable(),
  awaitingPrice: z.object({
    pairs: z.number().int(),
    sellers: z.number().int(),
    variants: z.number().int(),
  }),
  /** Revenue for the selected period: hourly for today, daily otherwise. */
  revenueSeries: z.object({
    granularity: z.enum(['hour', 'day']),
    points: z.array(z.object({ date: z.string(), revenue: z.number() })),
  }),
  queue: z.array(queueItemSchema),
  recentOperations: z.array(recentOperationSchema),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
