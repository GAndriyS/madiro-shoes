import { Injectable } from '@nestjs/common';
import type { MeSummary } from '@madiro/shared';

import { storeDayStart } from '../lib/time';
import { PrismaService } from '../prisma/prisma.service';

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
}
