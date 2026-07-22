import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CheckoutResult,
  PairLookupInput,
  SaleCombo,
  SaleInput,
  SaleLookupResponse,
  StockSearchResponse,
  WriteoffInput,
} from '@madiro/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SaleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scan-to-sell lookup (FR-S-06/09). The tag gives 3 of the 5 identity fields;
   * the response narrows material/season to combinations actually in stock
   * (rule 3.3 #5), picks the FIFO candidate pair for the exact match (rule #4),
   * prefills the last sale price of the variant (rule #9) and, when nothing
   * matches, lists close matches for the «Схожі на складі» block.
   */
  async lookup(input: PairLookupInput): Promise<SaleLookupResponse> {
    // Every variant of this style+color that still has pairs in stock.
    const variants = await this.prisma.variant.findMany({
      where: {
        style: input.style,
        color: input.color,
        pairs: { some: { status: 'IN_STOCK' } },
      },
      include: {
        pairs: {
          where: { status: 'IN_STOCK' },
          orderBy: { intakeDate: 'asc' },
          select: { id: true, size: true, intakeDate: true, awaitingPrice: true },
        },
      },
    });

    const combos: SaleCombo[] = variants.map((v) => ({
      material: v.material,
      season: v.season,
      sizes: [...new Set(v.pairs.map((p) => p.size))].sort((a, b) => a - b),
    }));

    // Resolve the variant: honour explicit material/season filters; otherwise
    // unambiguous only when a single combo exists (rule #5 — no guessing).
    const filtered = variants.filter(
      (v) =>
        (input.material === undefined || v.material === input.material) &&
        (input.season === undefined || v.season === input.season),
    );
    const resolved = filtered.length === 1 ? filtered[0] : null;

    // FIFO candidate: the oldest in-stock pair of the resolved variant in this size.
    const candidate = resolved?.pairs.find((p) => p.size === input.size) ?? null;

    let salePriceHint: number | null = null;
    if (resolved) {
      const lastSale = await this.prisma.operation.findFirst({
        where: {
          type: 'SALE',
          cancelledAt: null,
          pair: { variantId: resolved.id },
        },
        orderBy: { createdAt: 'desc' },
        select: { salePrice: true },
      });
      salePriceHint = lastSale?.salePrice != null ? Number(lastSale.salePrice) : null;
    }

    // Close matches for the not-found card: same style in stock, grouped by
    // (style · color · size) with a pair count (design 2b-1).
    let similar: SaleLookupResponse['similar'] = [];
    if (!candidate) {
      const rows = await this.prisma.pair.findMany({
        where: { status: 'IN_STOCK', variant: { style: input.style } },
        select: { size: true, variant: { select: { style: true, color: true } } },
      });
      const grouped = new Map<
        string,
        { style: string; color: string; size: number; count: number }
      >();
      for (const row of rows) {
        const key = `${row.variant.style}·${row.variant.color}·${row.size}`;
        const entry = grouped.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          grouped.set(key, {
            style: row.variant.style,
            color: row.variant.color,
            size: row.size,
            count: 1,
          });
        }
      }
      similar = [...grouped.values()]
        .sort((a, b) => a.color.localeCompare(b.color) || a.size - b.size)
        .slice(0, 6);
    }

    return {
      combos,
      pair: candidate
        ? {
            pairId: candidate.id,
            style: resolved!.style,
            color: resolved!.color,
            size: candidate.size,
            material: resolved!.material,
            season: resolved!.season,
            intakeDate: candidate.intakeDate.toISOString(),
            awaitingPrice: candidate.awaitingPrice,
          }
        : null,
      salePriceHint,
      similar,
    };
  }

  /**
   * Reference stock search by style prefix (FR-S-16): variants with in-stock
   * pairs and per-size counts. No prices of any kind — seller-safe (FR-B-02).
   */
  async search(stylePrefix: string): Promise<StockSearchResponse> {
    const variants = await this.prisma.variant.findMany({
      where: {
        style: { startsWith: stylePrefix },
        pairs: { some: { status: 'IN_STOCK' } },
      },
      orderBy: [{ style: 'asc' }, { color: 'asc' }],
      take: 20,
      include: {
        pairs: { where: { status: 'IN_STOCK' }, select: { size: true } },
      },
    });

    return {
      items: variants.map((v) => {
        const counts = new Map<number, number>();
        for (const p of v.pairs) {
          counts.set(p.size, (counts.get(p.size) ?? 0) + 1);
        }
        return {
          style: v.style,
          color: v.color,
          material: v.material,
          season: v.season,
          sizes: [...counts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([size, count]) => ({ size, count })),
        };
      }),
    };
  }

  /** Sale (FR-S-07). A draft (awaitingPrice) sells too — margin waits (rule #2). */
  sell(input: SaleInput, userId: string): Promise<CheckoutResult> {
    return this.checkout(input.pairId, userId, {
      type: 'SALE',
      status: 'SOLD',
      salePrice: new Prisma.Decimal(input.salePrice),
      paymentMethod: input.paymentMethod,
    });
  }

  /** Write-off (FR-S-08): no price, optional reason comment. */
  writeoff(input: WriteoffInput, userId: string): Promise<CheckoutResult> {
    return this.checkout(input.pairId, userId, {
      type: 'WRITEOFF',
      status: 'WRITTEN_OFF',
      comment: input.comment ?? null,
    });
  }

  /**
   * Shared checkout transaction. Locks the pair row (SELECT … FOR UPDATE) so
   * two sellers cannot check out the same last pair (section 7 #12): the loser
   * sees a 409 and re-scans.
   */
  private checkout(
    pairId: string,
    userId: string,
    op: {
      type: 'SALE' | 'WRITEOFF';
      status: 'SOLD' | 'WRITTEN_OFF';
      salePrice?: Prisma.Decimal;
      paymentMethod?: 'CASH' | 'CARD';
      comment?: string | null;
    },
  ): Promise<CheckoutResult> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM pairs WHERE id = ${pairId} FOR UPDATE`;
      const row = locked[0];
      if (!row) {
        throw new NotFoundException('Пару не знайдено');
      }
      if (row.status !== 'IN_STOCK') {
        throw new ConflictException('Пара вже продана або списана');
      }

      const pair = await tx.pair.update({
        where: { id: pairId },
        data: { status: op.status },
        include: { variant: { select: { style: true, color: true, purchasePrice: true } } },
      });

      await tx.operation.create({
        data: {
          type: op.type,
          pairId,
          userId,
          salePrice: op.salePrice ?? null,
          paymentMethod: op.paymentMethod ?? null,
          comment: op.comment ?? null,
          // Margin basis frozen at checkout time (rule 3.3 #1); never returned to sellers.
          purchasePriceAtTime: pair.variant.purchasePrice,
        },
      });

      return {
        pairId,
        style: pair.variant.style,
        color: pair.variant.color,
        size: pair.size,
        status: pair.status,
        salePrice: op.salePrice != null ? Number(op.salePrice) : null,
        paymentMethod: op.paymentMethod ?? null,
      };
    });
  }
}
