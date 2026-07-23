import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StockListQuery, StockListResponse, VariantDetail } from '@madiro/shared';

import { PrismaService } from '../prisma/prisma.service';

const PAGE_SIZE = 8;
const DAY_MS = 86_400_000;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stock table (FR-D-06): one row per variant with in-stock pairs; filters,
   * sort and pagination are server-side (NFR-02). The summary spans the whole
   * stock, not the filtered page.
   */
  async list(query: StockListQuery): Promise<StockListResponse> {
    const variants = await this.prisma.variant.findMany({
      where: { pairs: { some: { status: 'IN_STOCK' } } },
      include: {
        pairs: {
          where: { status: 'IN_STOCK' },
          select: { size: true, awaitingPrice: true },
        },
      },
    });

    const salePrices = await this.lastSalePrices(variants.map((v) => v.id));

    const allRows = variants
      .map((v) => ({
        id: v.id,
        style: v.style,
        color: v.color,
        material: v.material,
        season: v.season,
        sizes: [...new Set(v.pairs.map((p) => p.size))].sort((a, b) => a - b),
        awaitingPriceCount: v.pairs.filter((p) => p.awaitingPrice).length,
        pairsCount: v.pairs.length,
        purchasePrice: v.purchasePrice != null ? Number(v.purchasePrice) : null,
        lastSalePrice: salePrices.get(v.id) ?? null,
      }))
      .filter((row) => row.pairsCount > 0);

    const search = query.search?.trim();
    const filtered = allRows
      .filter((row) => {
        if (search) {
          const bySize = /^\d+$/.test(search) && row.sizes.includes(Number(search));
          if (!row.style.includes(search) && !row.color.includes(search) && !bySize) return false;
        }
        if (query.material && row.material !== query.material) return false;
        if (query.season && row.season !== query.season) return false;
        if (query.awaitingPrice && row.awaitingPriceCount === 0) return false;
        if (query.lowStock && row.pairsCount > 2) return false;
        if (query.size != null && !row.sizes.includes(query.size)) return false;
        return true;
      })
      .sort((a, b) => {
        const byStyle = a.style.localeCompare(b.style);
        const primary = query.sort === 'style-desc' ? -byStyle : byStyle;
        return primary !== 0 ? primary : a.color.localeCompare(b.color);
      });

    const start = (query.page - 1) * PAGE_SIZE;
    const queueVariants = await this.prisma.pair.groupBy({
      by: ['variantId'],
      where: { awaitingPrice: true },
    });

    return {
      items: filtered.slice(start, start + PAGE_SIZE),
      page: query.page,
      pageSize: PAGE_SIZE,
      total: filtered.length,
      summary: {
        pairsTotal: allRows.reduce((s, r) => s + r.pairsCount, 0),
        variantsTotal: allRows.length,
        purchaseValue: allRows.reduce((s, r) => s + (r.purchasePrice ?? 0) * r.pairsCount, 0),
      },
      queueVariants: queueVariants.length,
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
      include: { pair: { select: { size: true } }, user: { select: { name: true } } },
    });

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
   * One purchase price per variant (FR-D-08, rule 3.3 #1): sets the price,
   * releases every awaiting pair and backfills the draft INTAKE operations'
   * frozen basis — the batch was accepted at exactly this price.
   */
  setPrice(variantId: string, purchasePrice: number): Promise<{ ok: true }> {
    return this.confirm(variantId, new Prisma.Decimal(purchasePrice));
  }

  /** «Без ціни — старий товар» (FR-D-11/14): deliberate price 0, distinct from null. */
  setNoPrice(variantId: string): Promise<{ ok: true }> {
    return this.confirm(variantId, new Prisma.Decimal(0));
  }

  private confirm(variantId: string, price: Prisma.Decimal): Promise<{ ok: true }> {
    return this.prisma.$transaction(async (tx) => {
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
        await tx.operation.updateMany({
          where: { pairId: { in: ids }, type: 'INTAKE' },
          data: { purchasePriceAtTime: price },
        });
      }
      return { ok: true as const };
    });
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

  /** The most recent sale price per variant, in one query pass. */
  private async lastSalePrices(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const sales = await this.prisma.operation.findMany({
      where: {
        type: 'SALE',
        cancelledAt: null,
        salePrice: { not: null },
        pair: { variantId: { in: variantIds } },
      },
      orderBy: { createdAt: 'desc' },
      select: { salePrice: true, pair: { select: { variantId: true } } },
    });
    const map = new Map<string, number>();
    for (const sale of sales) {
      if (!map.has(sale.pair.variantId)) {
        map.set(sale.pair.variantId, Number(sale.salePrice));
      }
    }
    return map;
  }
}
