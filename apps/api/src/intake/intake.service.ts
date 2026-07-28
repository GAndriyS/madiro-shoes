import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Material, type Season, type Variant } from '@prisma/client';
import type {
  DraftUpdateInput,
  IntakeHistoryResponse,
  IntakeInput,
  IntakeQueueResponse,
  IntakeResult,
  MyDraft,
  Role,
} from '@madiro/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const HISTORY_PAGE_SIZE = 6;
const DAY_MS = 86_400_000;

interface VariantIdentity {
  style: string;
  color: string;
  material: Material | null;
  season: Season | null;
}

/**
 * Find-or-create a variant by its 5-field identity (section 3.2), serialized
 * per identity.
 *
 * `@@unique([style, color, material, season])` cannot carry this on its own:
 * Postgres treats NULLs as distinct, so two sellers scanning the same
 * material-less variant at the same moment would both pass the existence check
 * and insert a duplicate (docs/audit-2026-07, M-2). A transaction-scoped
 * advisory lock keyed by the identity makes the check-then-act atomic; the lock
 * is released when the transaction commits or rolls back, and it only ever
 * serializes intakes of the very same variant.
 */
async function findOrCreateVariant(
  tx: Prisma.TransactionClient,
  identity: VariantIdentity,
): Promise<Variant> {
  // '|' is safe as a separator: style/color are digit codes and material/season
  // are enum names, so no field can contain it and forge another identity.
  const key = [identity.style, identity.color, identity.material ?? '', identity.season ?? ''].join(
    '|',
  );
  // $executeRaw, not $queryRaw: the lock function returns void, which has no
  // Prisma column type to deserialize.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;

  return (
    (await tx.variant.findFirst({ where: identity })) ??
    (await tx.variant.create({ data: identity }))
  );
}

@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

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

    const result = await this.prisma.$transaction(async (tx) => {
      const variant = await findOrCreateVariant(tx, {
        style: input.style,
        color: input.color,
        material,
        season,
      });

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

    // A seller's draft moves the queue and its badge; a priced admin intake
    // only moves stock — the dashboard reacts to both.
    this.realtime.emit(result.awaitingPrice ? 'intake-draft' : 'intake-priced');
    return result;
  }

  /**
   * Edit an own draft still awaiting price (FR-S-13): the five identity fields
   * only. Changing variant fields moves the pair via find-or-create; a variant
   * left without pairs stays around for future reuse.
   */
  async updateDraft(pairId: string, input: DraftUpdateInput, userId: string): Promise<MyDraft> {
    const material = input.material ?? null;
    const season = input.season ?? null;

    const draft = await this.prisma.$transaction(async (tx) => {
      await this.findOwnDraft(tx, pairId, userId);

      const variant = await findOrCreateVariant(tx, {
        style: input.style,
        color: input.color,
        material,
        season,
      });

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

    this.realtime.emit('intake-draft');
    return draft;
  }

  /**
   * Delete an own draft awaiting price (FR-S-13). Operations reference the pair
   * with FK RESTRICT, so the INTAKE operation goes first, in one transaction.
   */
  async deleteDraft(pairId: string, userId: string): Promise<{ pairId: string }> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      await this.findOwnDraft(tx, pairId, userId);
      await tx.operation.deleteMany({ where: { pairId } });
      await tx.pair.delete({ where: { id: pairId } });
      return { pairId };
    });

    this.realtime.emit('intake-draft');
    return deleted;
  }

  /**
   * Admin queue (FR-D-11): variants with pairs awaiting a price, grouped by
   * variant; a pair sold before pricing stays in the queue flagged `sold`.
   */
  async queue(): Promise<IntakeQueueResponse> {
    const pairs = await this.prisma.pair.findMany({
      where: { awaitingPrice: true },
      orderBy: { createdAt: 'asc' },
      include: {
        variant: {
          select: {
            id: true,
            style: true,
            color: true,
            material: true,
            season: true,
            purchasePrice: true,
          },
        },
        createdBy: { select: { name: true } },
        operations: {
          where: { type: 'SALE', cancelledAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { salePrice: true },
        },
      },
    });

    const byVariant = new Map<string, typeof pairs>();
    for (const pair of pairs) {
      const group = byVariant.get(pair.variantId) ?? [];
      group.push(pair);
      byVariant.set(pair.variantId, group);
    }

    const items = [...byVariant.values()]
      .map((group) => {
        const first = group[0]!;
        return {
          variantId: first.variant.id,
          style: first.variant.style,
          color: first.variant.color,
          material: first.variant.material,
          season: first.variant.season,
          sellerName: first.createdBy?.name ?? '—',
          createdAt: first.createdAt.toISOString(),
          // The previous confirmed price of this variant prefills the modal (FR-D-08).
          lastPurchasePrice:
            first.variant.purchasePrice != null ? Number(first.variant.purchasePrice) : null,
          sizes: group.map((p) => ({
            pairId: p.id,
            size: p.size,
            sold: p.status === 'SOLD',
            soldPrice:
              p.operations[0]?.salePrice != null ? Number(p.operations[0].salePrice) : null,
          })),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      items,
      summary: {
        awaitingPairs: pairs.length,
        variants: byVariant.size,
        sellers: new Set(pairs.map((p) => p.createdById).filter(Boolean)).size,
      },
    };
  }

  /**
   * Admin history (FR-D-12): confirmed intakes only (active drafts excluded),
   * newest first, with a trailing-30-days summary.
   */
  async history(page: number): Promise<IntakeHistoryResponse> {
    const where = {
      type: 'INTAKE' as const,
      cancelledAt: null,
      pair: { awaitingPrice: false },
    };
    const monthAgo = new Date(Date.now() - 30 * DAY_MS);

    const [total, ops, monthOps] = await Promise.all([
      this.prisma.operation.count({ where }),
      this.prisma.operation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
        include: {
          pair: {
            select: {
              size: true,
              variant: { select: { style: true, color: true, material: true, season: true } },
            },
          },
          user: { select: { name: true } },
        },
      }),
      this.prisma.operation.findMany({
        where: { ...where, createdAt: { gte: monthAgo } },
        select: { purchasePriceAtTime: true },
      }),
    ]);

    return {
      items: ops.map((op) => ({
        id: op.id,
        style: op.pair.variant.style,
        color: op.pair.variant.color,
        sizes: [op.pair.size],
        date: op.createdAt.toISOString(),
        actorName: op.user.name,
        material: op.pair.variant.material,
        season: op.pair.variant.season,
        purchasePrice: op.purchasePriceAtTime != null ? Number(op.purchasePriceAtTime) : null,
      })),
      page,
      pageSize: HISTORY_PAGE_SIZE,
      total,
      monthSummary: {
        pairs: monthOps.length,
        total: monthOps.reduce(
          (sum, op) => sum + (op.purchasePriceAtTime != null ? Number(op.purchasePriceAtTime) : 0),
          0,
        ),
        pairsWithoutPrice: monthOps.filter(
          (op) => op.purchasePriceAtTime != null && Number(op.purchasePriceAtTime) === 0,
        ).length,
      },
    };
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
