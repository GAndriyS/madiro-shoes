import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CancelOperationResult,
  StockListQuery,
  StockListResponse,
  VariantDetail,
} from '@madiro/shared';
import { usdToUah } from '@madiro/shared';

import { ExchangeService } from '../exchange/exchange.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const PAGE_SIZE = 8;
const DAY_MS = 86_400_000;
/** Chip «Залишок ≤ 2» (FR-D-06). */
const LOW_STOCK_MAX_PAIRS = 2;

/**
 * In-stock pairs rolled up per variant: pair count, awaiting-price count and
 * the distinct sizes. Every stock query starts from this CTE so the aggregation
 * happens once, in Postgres, over the `pairs_variantId_size_status` index —
 * instead of materializing every pair in Node (docs/audit-2026-07, M-1).
 */
const STOCK_ROLLUP = Prisma.sql`
  WITH stock AS (
    SELECT p."variantId"                                        AS variant_id,
           COUNT(*)::int                                        AS pairs_count,
           COUNT(*) FILTER (WHERE p."awaitingPrice")::int        AS awaiting_count,
           ARRAY_AGG(DISTINCT p.size ORDER BY p.size)           AS sizes
    FROM pairs p
    WHERE p.status = 'IN_STOCK'
    GROUP BY p."variantId"
  )`;

interface StockRowSql {
  id: string;
  style: string;
  color: string;
  material: 'LEATHER' | 'SUEDE' | null;
  season: 'NONE' | 'BAIKA' | 'SHEEPSKIN';
  purchase_price: number | null;
  pairs_count: number;
  awaiting_count: number;
  sizes: number[];
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly exchange: ExchangeService,
  ) {}

  /**
   * Stock table (FR-D-06): one row per variant with in-stock pairs. Search,
   * filter chips, sort and pagination all run in Postgres (NFR-02) — the table
   * is sized for thousands of pairs, so a filter click must not drag the whole
   * stock through Node. The summary spans the whole stock, not the filtered
   * page, and is computed by a separate aggregate query.
   */
  async list(query: StockListQuery): Promise<StockListResponse> {
    const conditions: Prisma.Sql[] = [];

    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      // Digits can mean a style, a colour code or a size — match all three.
      conditions.push(
        /^\d+$/.test(search)
          ? Prisma.sql`(v.style ILIKE ${like} OR v.color ILIKE ${like} OR ${Number(search)} = ANY(s.sizes))`
          : Prisma.sql`(v.style ILIKE ${like} OR v.color ILIKE ${like})`,
      );
    }
    if (query.material) {
      conditions.push(Prisma.sql`v.material = ${query.material}::"Material"`);
    }
    if (query.season) {
      conditions.push(Prisma.sql`v.season = ${query.season}::"Season"`);
    }
    if (query.awaitingPrice) {
      conditions.push(Prisma.sql`s.awaiting_count > 0`);
    }
    if (query.lowStock) {
      conditions.push(Prisma.sql`s.pairs_count <= ${LOW_STOCK_MAX_PAIRS}`);
    }
    if (query.size != null) {
      conditions.push(Prisma.sql`${query.size} = ANY(s.sizes)`);
    }
    const where =
      conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const order =
      query.sort === 'style-desc'
        ? Prisma.sql`ORDER BY v.style DESC, v.color ASC`
        : Prisma.sql`ORDER BY v.style ASC, v.color ASC`;

    const [rows, total, summary, queue] = await Promise.all([
      this.prisma.$queryRaw<StockRowSql[]>`
        ${STOCK_ROLLUP}
        SELECT v.id, v.style, v.color, v.material, v.season,
               v."purchasePrice"::float8 AS purchase_price,
               s.pairs_count, s.awaiting_count, s.sizes
        FROM variants v
        JOIN stock s ON s.variant_id = v.id
        ${where}
        ${order}
        LIMIT ${PAGE_SIZE} OFFSET ${(query.page - 1) * PAGE_SIZE}`,
      // Counted separately, not with COUNT(*) OVER(): a page past the end
      // returns no rows, and the pager still needs the real total.
      this.prisma.$queryRaw<{ count: number }[]>`
        ${STOCK_ROLLUP}
        SELECT COUNT(*)::int AS count
        FROM variants v
        JOIN stock s ON s.variant_id = v.id
        ${where}`,
      this.prisma.$queryRaw<
        { pairs_total: number; variants_total: number; purchase_value: number }[]
      >`
        ${STOCK_ROLLUP}
        SELECT COALESCE(SUM(s.pairs_count), 0)::int                                     AS pairs_total,
               COUNT(*)::int                                                            AS variants_total,
               COALESCE(SUM(COALESCE(v."purchasePrice", 0) * s.pairs_count), 0)::float8 AS purchase_value
        FROM variants v
        JOIN stock s ON s.variant_id = v.id`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT "variantId")::int AS count FROM pairs WHERE "awaitingPrice" = true`,
    ]);

    // Only the page's variants need a last-sale price.
    const salePrices = await this.lastSalePrices(rows.map((row) => row.id));

    return {
      items: rows.map((row) => ({
        id: row.id,
        style: row.style,
        color: row.color,
        material: row.material,
        season: row.season,
        sizes: row.sizes,
        awaitingPriceCount: row.awaiting_count,
        pairsCount: row.pairs_count,
        purchasePrice: row.purchase_price,
        lastSalePrice: salePrices.get(row.id) ?? null,
      })),
      page: query.page,
      pageSize: PAGE_SIZE,
      total: total[0]?.count ?? 0,
      summary: {
        pairsTotal: summary[0]?.pairs_total ?? 0,
        variantsTotal: summary[0]?.variants_total ?? 0,
        purchaseValue: summary[0]?.purchase_value ?? 0,
      },
      queueVariants: queue[0]?.count ?? 0,
    };
  }

  /** Variant drawer (FR-D-07): mini-KPIs, per-pair list and movement history. */
  async detail(variantId: string): Promise<VariantDetail> {
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
      include: {
        pairs: {
          where: { status: 'IN_STOCK' },
          orderBy: [{ size: 'asc' }, { intakeDate: 'asc' }],
          select: { id: true, size: true, intakeDate: true, awaitingPrice: true },
        },
      },
    });
    if (!variant) {
      throw new NotFoundException('Варіант не знайдено');
    }

    const ops = await this.prisma.operation.findMany({
      where: { cancelledAt: null, pair: { variantId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        pair: { select: { id: true, size: true, status: true } },
        user: { select: { name: true } },
      },
    });

    // Cancellable = the sale/write-off that currently holds the pair off the
    // shelf, i.e. the newest such operation for a pair still SOLD/WRITTEN_OFF.
    // A sale that was already returned is not cancellable — the return has
    // netted it out, cancelling too would subtract it twice.
    const cancellable = new Set<string>();
    const seenPairs = new Set<string>();
    for (const op of ops) {
      if (op.type !== 'SALE' && op.type !== 'WRITEOFF') continue;
      if (seenPairs.has(op.pairId)) continue;
      seenPairs.add(op.pairId);
      const holds =
        (op.type === 'SALE' && op.pair.status === 'SOLD') ||
        (op.type === 'WRITEOFF' && op.pair.status === 'WRITTEN_OFF');
      if (holds) cancellable.add(op.id);
    }

    const lastSale = ops.find((op) => op.type === 'SALE' && op.salePrice != null);
    const monthAgo = new Date(Date.now() - 30 * DAY_MS);
    const soldLast30Days = await this.prisma.operation.count({
      where: {
        type: 'SALE',
        cancelledAt: null,
        createdAt: { gte: monthAgo },
        pair: { variantId },
      },
    });

    return {
      id: variant.id,
      style: variant.style,
      color: variant.color,
      material: variant.material,
      season: variant.season,
      purchasePrice: variant.purchasePrice != null ? Number(variant.purchasePrice) : null,
      lastSalePrice: lastSale?.salePrice != null ? Number(lastSale.salePrice) : null,
      soldLast30Days,
      pairs: variant.pairs.map((p) => ({
        id: p.id,
        size: p.size,
        intakeDate: p.intakeDate.toISOString(),
        awaitingPrice: p.awaitingPrice,
      })),
      history: ops.map((op) => {
        const price = op.salePrice != null ? Number(op.salePrice) : null;
        const basis = op.purchasePriceAtTime != null ? Number(op.purchasePriceAtTime) : null;
        const amount =
          op.type === 'SALE' ? price : op.type === 'RETURN' && price != null ? -price : basis;
        return {
          id: op.id,
          canCancel: cancellable.has(op.id),
          date: op.createdAt.toISOString(),
          type: op.type,
          sizes: [op.pair.size],
          amount,
          actorName: op.user.name,
          paymentMethod: op.paymentMethod,
        };
      }),
    };
  }

  /**
   * Reverse a mistaken sale or write-off (FR-D-07, decision §7.2). The
   * operation is marked cancelled rather than deleted — the movement history
   * keeps the trace, and every read path already filters `cancelledAt`, so
   * revenue, margin and the seller's own list recompute themselves. The pair
   * returns to the shelf with its draft status untouched, exactly like a
   * customer return.
   *
   * Only sales and write-offs are reversible: cancelling an intake would have
   * to decide what happens to a pair that may already be sold, and cancelling a
   * return would re-sell a pair the customer physically handed back. Both are
   * out of scope by decision, so they are refused loudly.
   */
  async cancelOperation(operationId: string): Promise<CancelOperationResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const op = await tx.operation.findUnique({
        where: { id: operationId },
        select: { id: true, type: true, pairId: true, cancelledAt: true },
      });
      if (!op) {
        throw new NotFoundException('Операцію не знайдено');
      }
      if (op.type !== 'SALE' && op.type !== 'WRITEOFF') {
        throw new BadRequestException('Скасувати можна лише продаж або списання');
      }
      if (op.cancelledAt != null) {
        throw new ConflictException('Операцію вже скасовано');
      }

      // The same row lock as a checkout: an admin cancelling and a seller
      // registering a return must not both put the pair back.
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM pairs WHERE id = ${op.pairId} FOR UPDATE`;
      const expected = op.type === 'SALE' ? 'SOLD' : 'WRITTEN_OFF';
      if (locked[0]?.status !== expected) {
        throw new ConflictException('Пара вже повернулася на склад');
      }

      await tx.operation.update({ where: { id: op.id }, data: { cancelledAt: new Date() } });
      const pair = await tx.pair.update({
        where: { id: op.pairId },
        data: { status: 'IN_STOCK' },
        select: { id: true, status: true },
      });

      return { operationId: op.id, pairId: pair.id, pairStatus: pair.status };
    });

    this.realtime.emit('operation-cancelled');
    return result;
  }

  /**
   * One purchase price per variant (FR-D-08, rule 3.3 #1): sets the price,
   * releases every awaiting pair and backfills the frozen basis of the
   * operations that were recorded without one — the batch was accepted at
   * exactly this price.
   */
  async setPrice(variantId: string, purchasePriceUsd: number): Promise<{ ok: true }> {
    // Entered in dollars, kept in hryvnia — the conversion happens here so the
    // rest of the service, and every read path, deals in one currency.
    const { rate } = await this.exchange.getRate();
    return this.confirm(variantId, new Prisma.Decimal(usdToUah(purchasePriceUsd, rate)));
  }

  /** «Без ціни — старий товар» (FR-D-11/14): deliberate price 0, distinct from null. */
  setNoPrice(variantId: string): Promise<{ ok: true }> {
    return this.confirm(variantId, new Prisma.Decimal(0));
  }

  private async confirm(variantId: string, price: Prisma.Decimal): Promise<{ ok: true }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const variant = await tx.variant.findUnique({
        where: { id: variantId },
        select: { id: true },
      });
      if (!variant) {
        throw new NotFoundException('Варіант не знайдено');
      }
      await tx.variant.update({ where: { id: variantId }, data: { purchasePrice: price } });
      const awaiting = await tx.pair.findMany({
        where: { variantId, awaitingPrice: true },
        select: { id: true },
      });
      const ids = awaiting.map((p) => p.id);
      if (ids.length > 0) {
        await tx.pair.updateMany({ where: { id: { in: ids } }, data: { awaitingPrice: false } });
        // Every operation of these pairs that was recorded without a basis —
        // the INTAKE itself, and the SALE/RETURN of a pair sold before it was
        // priced (FR-D-11). Without the sale, the pair's margin would stay
        // uncounted forever, even though the shop now knows what it paid.
        // `purchasePriceAtTime: null` guards real history: an operation that
        // already froze a price keeps it.
        await tx.operation.updateMany({
          where: { pairId: { in: ids }, purchasePriceAtTime: null },
          data: { purchasePriceAtTime: price },
        });
      }
      return { ok: true as const };
    });

    // Confirming a price empties part of the queue — other dashboard sessions
    // (a second tab, the admin's phone) must see it without a reload.
    this.realtime.emit('intake-priced');
    return result;
  }

  /** Delete a pair (FR-D-09): operations first (FK RESTRICT), one transaction. */
  deletePair(pairId: string): Promise<{ ok: true }> {
    return this.prisma.$transaction(async (tx) => {
      const pair = await tx.pair.findUnique({ where: { id: pairId }, select: { id: true } });
      if (!pair) {
        throw new NotFoundException('Пару не знайдено');
      }
      await tx.operation.deleteMany({ where: { pairId } });
      await tx.pair.delete({ where: { id: pairId } });
      return { ok: true as const };
    });
  }

  /**
   * The most recent sale price per variant. DISTINCT ON keeps one row per
   * variant in Postgres instead of shipping every sale of every variant to Node
   * just to take the first of each (docs/audit-2026-07, M-1).
   */
  private async lastSalePrices(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const sales = await this.prisma.$queryRaw<{ variant_id: string; sale_price: number }[]>`
      SELECT DISTINCT ON (p."variantId")
             p."variantId"      AS variant_id,
             o."salePrice"::float8 AS sale_price
      FROM operations o
      JOIN pairs p ON p.id = o."pairId"
      WHERE o.type = 'SALE'
        AND o."cancelledAt" IS NULL
        AND o."salePrice" IS NOT NULL
        AND p."variantId" IN (${Prisma.join(variantIds)})
      ORDER BY p."variantId", o."createdAt" DESC`;

    return new Map(sales.map((sale) => [sale.variant_id, sale.sale_price]));
  }
}
