import { z } from 'zod';

import { OPERATION_TYPES, PAYMENT_METHODS } from '../enums.js';

/** Overview periods (FR-D-02): today / week / month / custom range. */
export const overviewPeriodSchema = z.enum(['today', 'week', 'month', 'custom']);
export type OverviewPeriod = z.infer<typeof overviewPeriodSchema>;

/**
 * Longest custom range the overview accepts, in calendar days. A year covers
 * every question the shop asks of it, and the daily revenue chart stays one
 * bar per day across the whole range instead of silently stopping short.
 */
export const OVERVIEW_MAX_RANGE_DAYS = 366;

const DAY_MS = 86_400_000;

/**
 * A calendar date as `YYYY-MM-DD`, interpreted in the store timezone. The
 * round trip rejects dates that only look right: `2026-02-30` matches the
 * pattern, and `Date` would quietly roll it over to 2 March.
 */
export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Очікується дата у форматі РРРР-ММ-ДД')
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    { message: 'Такої дати не існує' },
  );

/** Inclusive length of a `from..to` range of calendar dates, in days. */
function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/**
 * GET /stats/overview query. `from`/`to` matter only for `period=custom`; a
 * range that runs backwards or spans more than {@link OVERVIEW_MAX_RANGE_DAYS}
 * is refused here rather than turned into an empty or truncated report. The
 * API completes a range with one end missing and checks the result against
 * this same schema, so both ends always obey the same rules.
 */
export const overviewQuerySchema = z
  .object({
    period: overviewPeriodSchema.default('today'),
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
  })
  .superRefine((query, ctx) => {
    if (query.from == null || query.to == null) return;
    if (query.from > query.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'Початок періоду пізніше за його кінець',
      });
    } else if (rangeDays(query.from, query.to) > OVERVIEW_MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Період довший за ${OVERVIEW_MAX_RANGE_DAYS} днів`,
      });
    }
  });
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

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
  /**
   * Net of returns, over operations with a purchase price only: a pair with no
   * basis yet (null) or deliberately none («без ціни — старий товар», 0) has
   * no margin to count (spec §2.2 #4).
   */
  margin: z.number(),
  /** Margin as a share of the revenue that HAS a basis; null — no such revenue. */
  marginPctOfRevenue: z.number().nullable(),
  /**
   * Sold without a purchase price, net of returns (FR-B-05): pairs and revenue
   * left out of the margin above — awaiting a price or «без ціни».
   */
  soldWithoutBasis: z.object({
    pairs: z.number().int(),
    revenue: z.number(),
  }),
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
