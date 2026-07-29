import { Injectable } from '@nestjs/common';
import type { MeSummary, MyDraftsResponse, MySalesQuery, MySalesResponse } from '@madiro/shared';

import { storeDayStart, storeMonthRange, storeMonthStart } from '../lib/time';
import { PrismaService } from '../prisma/prisma.service';

/** Half-open range as a Prisma filter: the end day itself must stay excluded. */
function rangeFilter(range: { start: Date; end: Date }): { gte: Date; lt: Date } {
  return { gte: range.start, lt: range.end };
}

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Scanner home summary: today's net sales + own drafts awaiting price. */
  async summary(userId: string): Promise<MeSummary> {
    const dayStart = storeDayStart();

    const [todayOps, draftsInQueue] = await Promise.all([
      this.prisma.operation.findMany({
        where: {
          userId,
          type: { in: ['SALE', 'RETURN'] },
          cancelledAt: null,
          createdAt: { gte: dayStart },
        },
        select: { type: true, salePrice: true },
      }),
      this.prisma.pair.count({
        where: { createdById: userId, awaitingPrice: true },
      }),
    ]);

    let pairs = 0;
    let total = 0;
    for (const op of todayOps) {
      const price = op.salePrice ? Number(op.salePrice) : 0;
      if (op.type === 'SALE') {
        pairs += 1;
        total += price;
      } else {
        pairs -= 1;
        total -= price;
      }
    }

    return { todaySalesPairs: pairs, todaySalesTotal: total, draftsInQueue };
  }

  /**
   * The seller's own sales for today, the current month, or a chosen calendar
   * month (FR-S-17). Informational only: no margins, no bonuses, no other
   * sellers.
   *
   * Today and the current month run open-ended (`gte`) because nothing can be
   * recorded after "now"; a chosen past month is bounded on both sides, or it
   * would drag in every sale since.
   */
  async sales(userId: string, query: MySalesQuery): Promise<MySalesResponse> {
    const createdAt =
      query.period === 'today'
        ? { gte: storeDayStart() }
        : query.month
          ? rangeFilter(storeMonthRange(query.month))
          : { gte: storeMonthStart() };

    const ops = await this.prisma.operation.findMany({
      where: {
        userId,
        // Write-offs ride along informationally (S-5): a seller must be able
        // to spot an accidental one. They never touch the totals below.
        type: { in: ['SALE', 'RETURN', 'WRITEOFF'] },
        cancelledAt: null,
        createdAt,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        pair: { select: { size: true, variant: { select: { style: true, color: true } } } },
      },
    });

    let pairs = 0;
    let total = 0;
    const items = ops.map((op) => {
      const price = op.salePrice != null ? Number(op.salePrice) : null;
      const sale = op.type === 'SALE';
      if (op.type !== 'WRITEOFF') {
        pairs += sale ? 1 : -1;
        total += (price ?? 0) * (sale ? 1 : -1);
      }
      return {
        id: op.id,
        type: op.type as 'SALE' | 'RETURN' | 'WRITEOFF',
        style: op.pair.variant.style,
        color: op.pair.variant.color,
        size: op.pair.size,
        at: op.createdAt.toISOString(),
        // A write-off has no money on it by domain rule; null keeps it that way
        // even if a stray salePrice ever appeared on the row.
        paymentMethod: op.type === 'WRITEOFF' ? null : op.paymentMethod,
        amount: op.type === 'WRITEOFF' || price == null ? null : sale ? price : -price,
      };
    });

    return { pairs, total, items };
  }

  /**
   * The seller's own intake pairs still on the shelf (FR-S-13): drafts awaiting
   * a price (editable/deletable) and already-confirmed ones (read-only).
   */
  async drafts(userId: string): Promise<MyDraftsResponse> {
    const rows = await this.prisma.pair.findMany({
      where: { createdById: userId, status: 'IN_STOCK' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { variant: { select: { style: true, color: true, material: true, season: true } } },
    });

    return {
      items: rows.map((p) => ({
        pairId: p.id,
        style: p.variant.style,
        color: p.variant.color,
        size: p.size,
        material: p.variant.material,
        season: p.variant.season,
        createdAt: p.createdAt.toISOString(),
        awaitingPrice: p.awaitingPrice,
      })),
    };
  }
}
