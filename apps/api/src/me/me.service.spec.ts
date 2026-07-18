import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { MeService } from './me.service';

describe('MeService', () => {
  let service: MeService;
  const findMany = jest.fn();
  const count = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: PrismaService, useValue: { operation: { findMany }, pair: { count } } },
      ],
    }).compile();
    service = moduleRef.get(MeService);
  });

  it('рахує нетто пар і суму: продажі мінус повернення', async () => {
    findMany.mockResolvedValue([
      { type: 'SALE', salePrice: 2850 },
      { type: 'SALE', salePrice: 3400 },
      { type: 'RETURN', salePrice: 2850 },
    ]);
    count.mockResolvedValue(2);

    const res = await service.summary('u1');

    expect(res).toEqual({ todaySalesPairs: 1, todaySalesTotal: 3400, draftsInQueue: 2 });
  });

  it('порожній день → нулі', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await expect(service.summary('u1')).resolves.toEqual({
      todaySalesPairs: 0,
      todaySalesTotal: 0,
      draftsInQueue: 0,
    });
  });

  it('фільтрує лише свої нескасовані операції з початку дня', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await service.summary('u42');

    const where = findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('u42');
    expect(where.cancelledAt).toBeNull();
    expect(where.type).toEqual({ in: ['SALE', 'RETURN'] });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(count.mock.calls[0][0].where).toEqual({ createdById: 'u42', awaitingPrice: true });
  });
});
