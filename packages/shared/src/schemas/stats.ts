import { z } from 'zod';

import { OPERATION_TYPES, PAYMENT_METHODS } from '../enums.js';

/** Періоди Огляду (FR-D-02): Сьогодні / Тиждень / Місяць / довільний Період. */
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
  /** Пара продана до вказання ціни (особливий кейс FR-D-11). */
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
  /** Сума операції; від'ємна для повернення; null — чернетка без ціни. */
  amount: z.number().nullable(),
  /** Маржа; null — не рахується (без вхідної ціни або поступлення). */
  margin: z.number().nullable(),
  isDraft: z.boolean(),
});
export type RecentOperation = z.infer<typeof recentOperationSchema>;

/** Відповідь GET /stats/overview — весь екран Огляду одним запитом. */
export const overviewResponseSchema = z.object({
  revenue: z.number(),
  /** Порівняння з попереднім періодом; null — не показується. */
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
  revenueByDay: z.array(z.object({ date: z.string(), revenue: z.number() })),
  queue: z.array(queueItemSchema),
  recentOperations: z.array(recentOperationSchema),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
