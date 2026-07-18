import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { IntakeService } from './intake.service';

/** Minimal transaction client the service drives inside $transaction. */
function makeTx() {
  return {
    variant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pair: { create: jest.fn() },
    operation: { create: jest.fn() },
  };
}

describe('IntakeService', () => {
  let service: IntakeService;
  let tx: ReturnType<typeof makeTx>;
  const transaction = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    tx = makeTx();
    transaction.mockImplementation((cb: (client: typeof tx) => unknown) => cb(tx));
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: PrismaService, useValue: { $transaction: transaction } },
      ],
    }).compile();
    service = moduleRef.get(IntakeService);

    tx.variant.create.mockResolvedValue({ id: 'v1' });
    tx.pair.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'p1',
        size: data.size,
        status: data.status,
        awaitingPrice: data.awaitingPrice,
      }),
    );
  });

  const input = { size: 38, color: '36', style: '7645' };

  it('продавець: завжди чернетка, ціна ігнорується навіть якщо прийшла', async () => {
    tx.variant.findFirst.mockResolvedValue(null);

    const res = await service.create(
      { ...input, purchasePrice: 999 },
      { id: 'u1', role: 'SELLER' },
    );

    expect(res).toEqual({
      pairId: 'p1',
      variantId: 'v1',
      size: 38,
      status: 'IN_STOCK',
      awaitingPrice: true,
    });
    expect(tx.variant.update).not.toHaveBeenCalled();
    expect(tx.pair.create.mock.calls[0][0].data.awaitingPrice).toBe(true);
    expect(tx.operation.create.mock.calls[0][0].data.purchasePriceAtTime).toBeNull();
  });

  it('адмін з ціною: оновлює ціну варіанта, pair не чекає ціни', async () => {
    tx.variant.findFirst.mockResolvedValue(null);

    await service.create({ ...input, purchasePrice: 1400 }, { id: 'admin', role: 'ADMIN' });

    expect(tx.variant.update).toHaveBeenCalledTimes(1);
    expect(Number(tx.variant.update.mock.calls[0][0].data.purchasePrice)).toBe(1400);
    expect(tx.pair.create.mock.calls[0][0].data.awaitingPrice).toBe(false);
    expect(Number(tx.operation.create.mock.calls[0][0].data.purchasePriceAtTime)).toBe(1400);
  });

  it('адмін "без ціни — старий товар" (null): pair на складі, ціна не оновлюється', async () => {
    tx.variant.findFirst.mockResolvedValue({ id: 'v1' });

    await service.create({ ...input, purchasePrice: null }, { id: 'admin', role: 'ADMIN' });

    expect(tx.variant.create).not.toHaveBeenCalled();
    expect(tx.variant.update).not.toHaveBeenCalled();
    expect(tx.pair.create.mock.calls[0][0].data.awaitingPrice).toBe(false);
    expect(tx.operation.create.mock.calls[0][0].data.purchasePriceAtTime).toBeNull();
  });

  it('перевикористовує наявний варіант за 5 полями, не створює новий', async () => {
    tx.variant.findFirst.mockResolvedValue({ id: 'existing' });

    const res = await service.create(
      { ...input, material: 'LEATHER', season: 'NONE' },
      { id: 'u1', role: 'SELLER' },
    );

    expect(res.variantId).toBe('existing');
    expect(tx.variant.create).not.toHaveBeenCalled();
    expect(tx.variant.findFirst.mock.calls[0][0].where).toEqual({
      style: '7645',
      color: '36',
      material: 'LEATHER',
      season: 'NONE',
    });
  });
});
