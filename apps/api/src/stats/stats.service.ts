import { Injectable } from '@nestjs/common';
import type { OverviewPeriod, OverviewResponse } from '@madiro/shared';

import { storeDayStart, storeDayStartOf, storeHourOf } from '../lib/time';
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
      const start = from ? storeDayStartOf(from) : new Date(dayStart.getTime() - 13 * DAY_MS);
      const endDay = to ? storeDayStartOf(to) : dayStart;
      return {
        start,
        end: new Date(endDay.getTime() + DAY_MS),
        prev: null,
        granularity: 'day',
      };
    }
  }
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

    // KPI totals: revenue and margin net of returns (rule 3.3 #6).
    let revenue = 0;
    let margin = 0;
    let sales = 0;
    let returns = 0;
    for (const op of ops) {
      const price = op.salePrice != null ? Number(op.salePrice) : 0;
      const basis = op.purchasePriceAtTime != null ? Number(op.purchasePriceAtTime) : null;
      const sign = op.type === 'SALE' ? 1 : -1;
      revenue += sign * price;
      if (basis != null) margin += sign * (price - basis);
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
      const days = Math.min(92, Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS));
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
      marginPctOfRevenue: revenue > 0 ? Math.round((margin / revenue) * 100) : null,
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
            price != null && basis != null ? (isReturn ? -(price - basis) : price - basis) : null,
          isDraft: op.type === 'INTAKE' && op.pair.awaitingPrice,
        };
      }),
    };
  }
}
