import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutResult, PairLookupInput, ReturnLookupResponse } from '@madiro/shared';

import { storeDayStart } from '../lib/time';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the sale a customer return reverses (FR-S-14): the most recent
   * non-cancelled SALE of a still-sold pair matching the scanned tag
   * (rule 3.3 #6 — with several identical sold pairs, take the last sale).
   */
  async lookup(input: PairLookupInput): Promise<ReturnLookupResponse> {
    const op = await this.prisma.operation.findFirst({
      where: {
        type: 'SALE',
        cancelledAt: null,
        pair: {
          status: 'SOLD',
          size: input.size,
          variant: { style: input.style, color: input.color },
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
      return { sale: null };
    }

    return {
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
   */
  register(operationId: string, userId: string): Promise<CheckoutResult> {
    return this.prisma.$transaction(async (tx) => {
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
  }
}
