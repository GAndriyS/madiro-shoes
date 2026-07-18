import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { IntakeInput, IntakeResult, Role } from '@madiro/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntakeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Take a pair into stock. Variants are auto-created from the tag fields; the
   * same 5-field identity reuses its variant. Role decides pricing (FR-B-02):
   * a seller only ever creates a draft (awaitingPrice, no price), while an admin
   * either sets the purchase price or marks the pair as deliberately price-less
   * ("old stock"). All three writes run in one transaction.
   */
  async create(input: IntakeInput, user: { id: string; role: Role }): Promise<IntakeResult> {
    const material = input.material ?? null;
    const season = input.season ?? null;

    // A seller's price (if any is smuggled in) is ignored: sellers never price.
    const isAdmin = user.role === 'ADMIN';
    const priced = isAdmin && input.purchasePrice != null;
    const awaitingPrice = !isAdmin;
    const purchasePrice = priced ? new Prisma.Decimal(input.purchasePrice as number) : null;

    return this.prisma.$transaction(async (tx) => {
      // upsert on @@unique([style,color,material,season]) is unreliable here:
      // Postgres treats NULL material/season as distinct, so find-or-create.
      const variant =
        (await tx.variant.findFirst({
          where: { style: input.style, color: input.color, material, season },
        })) ??
        (await tx.variant.create({
          data: { style: input.style, color: input.color, material, season },
        }));

      // An admin's explicit price becomes the variant's single purchase price
      // (rule 3.3 #1); a draft or "no price" leaves any existing price untouched.
      if (priced) {
        await tx.variant.update({ where: { id: variant.id }, data: { purchasePrice } });
      }

      const pair = await tx.pair.create({
        data: {
          variantId: variant.id,
          size: input.size,
          status: 'IN_STOCK',
          awaitingPrice,
          createdById: user.id,
        },
      });

      await tx.operation.create({
        data: {
          type: 'INTAKE',
          pairId: pair.id,
          userId: user.id,
          purchasePriceAtTime: purchasePrice,
        },
      });

      return {
        pairId: pair.id,
        variantId: variant.id,
        size: pair.size,
        status: pair.status,
        awaitingPrice: pair.awaitingPrice,
      };
    });
  }
}
