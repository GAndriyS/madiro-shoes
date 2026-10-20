import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  OVERVIEW_MAX_RANGE_DAYS,
  type OverviewPeriod,
  type OverviewResponse,
} from '@madiro/shared';

import {
  shiftDateKey,
  storeDateKey,
  storeDayStart,
  storeDayStartOf,
  storeHourOf,
} from '../lib/time';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;

interface Range {
  start: Date;
  /** Exclusive upper bound. */
  end: Date;
  /** Previous equivalent range for the revenue delta (today only). */
  prev: { start: Date; end: Date } | null;
  granularity: 'hour' | 'day';
}

/**
 * The calendar days a custom range covers once its missing ends are filled in:
 * it ends today unless told otherwise, and starts 13 days before its end — two
 * weeks. The controller validates exactly this completed range, so the report
 * and the check can never disagree about what was asked for.
 */
export function customRangeOf(
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date = new Date(),
): { from: string; to: string } {
  const end = to ?? storeDateKey(now);
  return { from: from ?? shiftDateKey(end, -13), to: end };
}

/** Store-timezone period boundaries for the overview KPIs (section 7 #11). */
function rangeFor(period: OverviewPeriod, from: string | null, to: string | null): Range {
  const dayStart = storeDayStart();
  const tomorrow = new Date(dayStart.getTime() + DAY_MS);
  switch (period) {
    case 'today':
      return {
        start: dayStart,
        end: tomorrow,
        prev: { start: new Date(dayStart.getTime() - DAY_MS), end: dayStart },
        granularity: 'hour',
      };
    case 'week':
      return {
        start: new Date(dayStart.getTime() - 6 * DAY_MS),
        end: tomorrow,
        prev: null,
        granularity: 'day',
      };
    case 'month':
      return {
        start: new Date(dayStart.getTime() - 29 * DAY_MS),
        end: tomorrow,
        prev: null,
        granularity: 'day',
      };
    case 'custom': {
      const days = customRangeOf(from, to);
      return {
        start: storeDayStartOf(days.from),
        // The midnight that opens the day after `to`, not `to` + 24 h: the two
        // differ by an hour when `to` is the day of a DST switch.
        end: storeDayStartOf(shiftDateKey(days.to, 1)),
        prev: null,
        granularity: 'day',
      };
    }
  }
}

/**
 * The purchase price a margin is computed against, or null when there is none
 * to compute: not entered yet (null) or «без ціни — старий товар» (0).
 */
function marginBasis(purchasePriceAtTime: Prisma.Decimal | null): number | null {
  if (purchasePriceAtTime == null) return null;
  const basis = Number(purchasePriceAtTime);
  return basis > 0 ? basis : null;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin overview (FR-D-02..05): KPI totals, revenue series, awaiting-price
   * queue and the latest operations — all store-timezone, cancelled operations
   * excluded everywhere. Admin-only: margins never reach sellers (FR-B-02).
   */
  async overview(
    period: OverviewPeriod,
    from: string | null,
    to: string | null,
  ): Promise<OverviewResponse> {
    const range = rangeFor(period, from, to);

    const [ops, prevOps, awaitingPairs, queuePairs, recentOps] = await Promise.all([
      this.prisma.operation.findMany({
        where: {
          type: { in: ['SALE', 'RETURN'] },
          cancelledAt: null,
          createdAt: { gte: range.start, lt: range.end },
        },
        select: {
          type: true,
          salePrice: true,
          purchasePriceAtTime: true,
          createdAt: true,
        },
      }),
      range.prev
        ? this.prisma.operation.findMany({
            where: {
              type: { in: ['SALE', 'RETURN'] },
              cancelledAt: null,
              createdAt: { gte: range.prev.start, lt: range.prev.end },
            },
            select: { type: true, salePrice: true },
          })
        : Promise.resolve([]),
      this.prisma.pair.findMany({
        where: { awaitingPrice: true },
        select: { variantId: true, createdById: true },
      }),
      // Queue widget: the latest drafts, sold-before-pricing included (FR-D-04).
      this.prisma.pair.findMany({
        where: { awaitingPrice: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          variant: { select: { style: true, color: true } },
          createdBy: { select: { name: true } },
          operations: {
            where: { type: 'SALE', cancelledAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      this.prisma.operation.findMany({
        where: { cancelledAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          pair: {
            select: {
              size: true,
              awaitingPrice: true,
              variant: { select: { style: true, color: true } },
            },
          },
          user: { select: { name: true } },
        },
      }),
    ]);

    // KPI totals: revenue and margin net of returns (rule 3.3 #6). Margin only
    // counts operations with a real basis: null is «ще не вказана», and 0 is
    // «без ціни — старий товар», which has no margin either (spec §2.2 #4) —
    // counting it would book the whole sale price as profit. Both kinds go to
    // the «sold without a purchase price» line instead (FR-B-05).
    let revenue = 0;
    let margin = 0;
    let revenueWithBasis = 0;
    let sales = 0;
    let returns = 0;
    const withoutBasis = { pairs: 0, revenue: 0 };
    for (const op of ops) {
      const price = op.salePrice != null ? Number(op.salePrice) : 0;
      const basis = marginBasis(op.purchasePriceAtTime);
      const sign = op.type === 'SALE' ? 1 : -1;
      revenue += sign * price;
      if (basis != null) {
        margin += sign * (price - basis);
        revenueWithBasis += sign * price;
      } else {
        withoutBasis.pairs += sign;
        withoutBasis.revenue += sign * price;
      }
      if (op.type === 'SALE') sales += 1;
      else returns += 1;
    }
    const prevRevenue = prevOps.reduce(
      (sum, op) =>
        sum + (op.type === 'SALE' ? 1 : -1) * (op.salePrice != null ? Number(op.salePrice) : 0),
      0,
    );

    // Revenue series: hourly buckets for today, per-day otherwise.
    const points: { date: string; revenue: number }[] = [];
    if (range.granularity === 'hour') {
      const buckets = new Map<number, number>();
      for (const op of ops) {
        const hour = storeHourOf(op.createdAt);
        const sign = op.type === 'SALE' ? 1 : -1;
        const price = op.salePrice != null ? Number(op.salePrice) : 0;
        buckets.set(hour, (buckets.get(hour) ?? 0) + sign * price);
      }
      const hours = [...buckets.keys()];
      const first = Math.min(9, ...(hours.length ? hours : [9]));
      const last = Math.max(19, ...(hours.length ? hours : [19]));
      for (let hour = first; hour <= last; hour += 1) {
        points.push({
          date: new Date(range.start.getTime() + hour * 3_600_000).toISOString(),
          revenue: buckets.get(hour) ?? 0,
        });
      }
    } else {
      const days = Math.min(
        OVERVIEW_MAX_RANGE_DAYS,
        Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS),
      );
      const buckets = new Array<number>(days).fill(0);
      for (const op of ops) {
        const index = Math.floor((op.createdAt.getTime() - range.start.getTime()) / DAY_MS);
        if (index >= 0 && index < days) {
          const sign = op.type === 'SALE' ? 1 : -1;
          buckets[index] =
            (buckets[index] ?? 0) + sign * (op.salePrice != null ? Number(op.salePrice) : 0);
        }
      }
      buckets.forEach((value, i) => {
        points.push({
          date: new Date(range.start.getTime() + i * DAY_MS + DAY_MS / 2).toISOString(),
          revenue: value,
        });
      });
    }

    return {
      revenue,
      revenueDeltaPct:
        range.prev && prevRevenue > 0
          ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100)
          : null,
      sales,
      returns,
      netPairs: sales - returns,
      margin,
      // A share of the revenue the margin was computed over — dividing by all
      // revenue would let unpriced sales dilute the percentage.
      marginPctOfRevenue:
        revenueWithBasis > 0 ? Math.round((margin / revenueWithBasis) * 100) : null,
      soldWithoutBasis: withoutBasis,
      awaitingPrice: {
        pairs: awaitingPairs.length,
        sellers: new Set(awaitingPairs.map((p) => p.createdById).filter(Boolean)).size,
        variants: new Set(awaitingPairs.map((p) => p.variantId)).size,
      },
      revenueSeries: { granularity: range.granularity, points },
      queue: queuePairs.map((p) => ({
        pairId: p.id,
        style: p.variant.style,
        color: p.variant.color,
        size: p.size,
        sellerName: p.createdBy?.name ?? '—',
        createdAt: p.createdAt.toISOString(),
        soldAt: p.operations[0]?.createdAt.toISOString() ?? null,
      })),
      recentOperations: recentOps.map((op) => {
        const price = op.salePrice != null ? Number(op.salePrice) : null;
        const basis = op.purchasePriceAtTime != null ? Number(op.purchasePriceAtTime) : null;
        // The feed shows the historical price as an intake's amount, 0 included,
        // but a sale of an unpriced pair has no margin to show (spec §2.2 #4).
        const costBasis = marginBasis(op.purchasePriceAtTime);
        const isReturn = op.type === 'RETURN';
        const amount = op.type === 'SALE' ? price : isReturn && price != null ? -price : basis;
        return {
          id: op.id,
          type: op.type,
          style: op.pair.variant.style,
          color: op.pair.variant.color,
          size: op.pair.size,
          at: op.createdAt.toISOString(),
          sellerName: op.user.name,
          paymentMethod: op.paymentMethod,
          amount,
          margin:
            price != null && costBasis != null
              ? isReturn
                ? -(price - costBasis)
                : price - costBasis
              : null,
          isDraft: op.type === 'INTAKE' && op.pair.awaitingPrice,
        };
      }),
    };
  }
}
