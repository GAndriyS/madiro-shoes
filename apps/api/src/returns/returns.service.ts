import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutResult, PairLookupInput, ReturnLookupResponse } from '@madiro/shared';

import { storeDayStart } from '../lib/time';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Find the sale a customer return reverses (FR-S-14): the most recent
   * non-cancelled SALE of a still-sold pair matching the scanned tag
   * (rule 3.3 #6 — with several identical sold pairs, take the last sale).
   *
   * The tag only carries size·color·style, so the full 5-field identity
   * (section 3.2) is resolved the same way checkout does it (rule 3.3 #5):
   * the response lists the material/insulation combinations that actually have
   * a returnable sale, an explicit choice narrows them, and a sale is returned
   * only once exactly one combination remains. Without this, a return could
   * reverse the sale of a different variant that happens to share
   * style·color·size (leather vs suede).
   */
  async lookup(input: PairLookupInput): Promise<ReturnLookupResponse> {
    // Variants whose sold pairs of this size still have a reversible sale.
    const variants = await this.prisma.variant.findMany({
      where: {
        style: input.style,
        color: input.color,
        pairs: {
          some: {
            status: 'SOLD',
            size: input.size,
            operations: { some: { type: 'SALE', cancelledAt: null } },
          },
        },
      },
      select: { id: true, material: true, season: true },
    });

    const combos = variants.map((v) => ({ material: v.material, season: v.season }));

    // `undefined` = the seller has not narrowed yet, explicit `null` = the
    // combination without a value (mirrors pairLookupSchema).
    const filtered = variants.filter(
      (v) =>
        (input.material === undefined || v.material === input.material) &&
        (input.season === undefined || v.season === input.season),
    );
    const resolved = filtered.length === 1 ? filtered[0] : null;
    if (!resolved) {
      return { combos, sale: null };
    }

    const op = await this.prisma.operation.findFirst({
      where: {
        type: 'SALE',
        cancelledAt: null,
        pair: {
          status: 'SOLD',
          size: input.size,
          variantId: resolved.id,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        pair: {
          select: {
            id: true,
            size: true,
            variant: { select: { style: true, color: true, material: true, season: true } },
          },
        },
        user: { select: { name: true } },
      },
    });

    if (!op || op.salePrice == null) {
      return { combos, sale: null };
    }

    return {
      combos,
      sale: {
        operationId: op.id,
        pairId: op.pair.id,
        style: op.pair.variant.style,
        color: op.pair.variant.color,
        size: op.pair.size,
        material: op.pair.variant.material,
        season: op.pair.variant.season,
        salePrice: Number(op.salePrice),
        paymentMethod: op.paymentMethod,
        soldAt: op.createdAt.toISOString(),
        // Calendar days in the store timezone: a 23:00 sale is "1 day ago" next morning.
        daysSince: Math.max(
          0,
          Math.round(
            (storeDayStart().getTime() - storeDayStart(op.createdAt).getTime()) / 86_400_000,
          ),
        ),
        sellerName: op.user.name,
      },
    };
  }

  /**
   * Register the return: the same pair flips SOLD → IN_STOCK (awaitingPrice
   * survives untouched, so a draft-sale return restores «очікує ціни», rule
   * 3.3 #7). The RETURN operation copies the sale's price/payment/purchase
   * basis — stored positive, read paths subtract it. Row-locked like a sale,
   * so a double return loses with a 409.
   *
   * `userId` is whoever is at the counter; the money comes off the seller who
   * made the sale (`attributedToId`). Whoever happens to serve the customer
   * must not have their own day go negative for a colleague's sale.
   */
  async register(operationId: string, userId: string): Promise<CheckoutResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.operation.findFirst({
        where: { id: operationId, type: 'SALE', cancelledAt: null },
        include: { pair: { select: { id: true } } },
      });
      if (!sale || sale.salePrice == null) {
        throw new NotFoundException('Продаж не знайдено');
      }

      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM pairs WHERE id = ${sale.pair.id} FOR UPDATE`;
      const row = locked[0];
      if (!row) {
        throw new NotFoundException('Пару не знайдено');
      }
      if (row.status !== 'SOLD') {
        throw new ConflictException('Пара вже на складі або списана');
      }

      const pair = await tx.pair.update({
        where: { id: sale.pair.id },
        data: { status: 'IN_STOCK' },
        include: { variant: { select: { style: true, color: true } } },
      });

      await tx.operation.create({
        data: {
          type: 'RETURN',
          pairId: pair.id,
          userId,
          attributedToId: sale.userId,
          salePrice: sale.salePrice,
          paymentMethod: sale.paymentMethod,
          // Mirror the sale's frozen margin basis so the reversal is symmetric.
          purchasePriceAtTime: sale.purchasePriceAtTime,
        },
      });

      return {
        pairId: pair.id,
        style: pair.variant.style,
        color: pair.variant.color,
        size: pair.size,
        status: pair.status,
        salePrice: Number(sale.salePrice),
        paymentMethod: sale.paymentMethod,
      };
    });

    this.realtime.emit('return');
    return result;
  }
}
