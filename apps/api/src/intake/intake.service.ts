import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DraftUpdateInput, IntakeInput, IntakeResult, MyDraft, Role } from '@madiro/shared';

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

  /**
   * Edit an own draft still awaiting price (FR-S-13): the five identity fields
   * only. Changing variant fields moves the pair via find-or-create; a variant
   * left without pairs stays around for future reuse.
   */
  updateDraft(pairId: string, input: DraftUpdateInput, userId: string): Promise<MyDraft> {
    const material = input.material ?? null;
    const season = input.season ?? null;

    return this.prisma.$transaction(async (tx) => {
      await this.findOwnDraft(tx, pairId, userId);

      const variant =
        (await tx.variant.findFirst({
          where: { style: input.style, color: input.color, material, season },
        })) ??
        (await tx.variant.create({
          data: { style: input.style, color: input.color, material, season },
        }));

      const pair = await tx.pair.update({
        where: { id: pairId },
        data: { variantId: variant.id, size: input.size },
      });

      return {
        pairId: pair.id,
        style: variant.style,
        color: variant.color,
        size: pair.size,
        material: variant.material,
        season: variant.season,
        createdAt: pair.createdAt.toISOString(),
        awaitingPrice: pair.awaitingPrice,
      };
    });
  }

  /**
   * Delete an own draft awaiting price (FR-S-13). Operations reference the pair
   * with FK RESTRICT, so the INTAKE operation goes first, in one transaction.
   */
  deleteDraft(pairId: string, userId: string): Promise<{ pairId: string }> {
    return this.prisma.$transaction(async (tx) => {
      await this.findOwnDraft(tx, pairId, userId);
      await tx.operation.deleteMany({ where: { pairId } });
      await tx.pair.delete({ where: { id: pairId } });
      return { pairId };
    });
  }

  /** A draft is editable only while it is the caller's own and still awaits a price. */
  private async findOwnDraft(
    tx: Prisma.TransactionClient,
    pairId: string,
    userId: string,
  ): Promise<void> {
    const draft = await tx.pair.findFirst({
      where: { id: pairId, createdById: userId, awaitingPrice: true, status: 'IN_STOCK' },
      select: { id: true },
    });
    if (!draft) {
      throw new NotFoundException('Чернетку не знайдено');
    }
  }
}
