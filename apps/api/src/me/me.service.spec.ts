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

  describe('sales', () => {
    beforeEach(() => findMany.mockResolvedValue([]));

    const whereOfLastCall = () => findMany.mock.calls[0][0].where;

    it('сьогодні: відкритий інтервал від початку дня', async () => {
      await service.sales('u1', { period: 'today' });

      const { createdAt } = whereOfLastCall();
      expect(createdAt.gte).toBeInstanceOf(Date);
      expect(createdAt.lt).toBeUndefined();
    });

    it('поточний місяць без явного month — теж відкритий інтервал', async () => {
      await service.sales('u1', { period: 'month' });

      const { createdAt } = whereOfLastCall();
      expect(createdAt.gte).toBeInstanceOf(Date);
      expect(createdAt.lt).toBeUndefined();
    });

    // A past month must be bounded on both sides, or it would sum every sale since.
    it('обраний місяць обмежений з обох боків', async () => {
      await service.sales('u1', { period: 'month', month: '2026-03' });

      const { createdAt } = whereOfLastCall();
      expect(createdAt.gte.toISOString()).toBe('2026-02-28T22:00:00.000Z');
      expect(createdAt.lt.toISOString()).toBe('2026-03-31T21:00:00.000Z');
    });

    it('рахує нетто за період і підписує повернення від’ємною сумою', async () => {
      findMany.mockResolvedValue([
        {
          id: 'o1',
          type: 'SALE',
          salePrice: 2850,
          paymentMethod: 'CARD',
          createdAt: new Date('2026-03-04T10:00:00.000Z'),
          pair: { size: 38, variant: { style: '7645', color: '36' } },
        },
        {
          id: 'o2',
          type: 'RETURN',
          salePrice: 2850,
          paymentMethod: 'CARD',
          createdAt: new Date('2026-03-05T10:00:00.000Z'),
          pair: { size: 38, variant: { style: '7645', color: '36' } },
        },
      ]);

      const res = await service.sales('u1', { period: 'month', month: '2026-03' });

      expect(res.pairs).toBe(0);
      expect(res.total).toBe(0);
      expect(res.items.map((i) => i.amount)).toEqual([2850, -2850]);
    });

    it('лише свої нескасовані операції; списання їдуть інформаційно (S-5)', async () => {
      await service.sales('u42', { period: 'month', month: '2026-03' });

      const where = whereOfLastCall();
      expect(where.userId).toBe('u42');
      expect(where.cancelledAt).toBeNull();
      expect(where.type).toEqual({ in: ['SALE', 'RETURN', 'WRITEOFF'] });
    });

    it('списання: рядок без суми й оплати, підсумки без нього', async () => {
      findMany.mockResolvedValueOnce([
        {
          id: 'o1',
          type: 'SALE',
          salePrice: 2850,
          paymentMethod: 'CARD',
          createdAt: new Date('2026-03-04T10:00:00.000Z'),
          pair: { size: 38, variant: { style: '7645', color: '36' } },
        },
        {
          id: 'o3',
          type: 'WRITEOFF',
          salePrice: null,
          paymentMethod: null,
          createdAt: new Date('2026-03-04T11:00:00.000Z'),
          pair: { size: 39, variant: { style: '7645', color: '36' } },
        },
      ]);

      const res = await service.sales('u1', { period: 'month', month: '2026-03' });

      expect(res.pairs).toBe(1);
      expect(res.total).toBe(2850);
      expect(res.items[1]).toMatchObject({ type: 'WRITEOFF', amount: null, paymentMethod: null });
    });
  });
});
