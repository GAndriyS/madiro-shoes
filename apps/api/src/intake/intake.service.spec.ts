import { Test } from '@nestjs/testing';

import { ExchangeService } from '../exchange/exchange.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { IntakeService } from './intake.service';

/** Minimal transaction client the service drives inside $transaction. */
function makeTx() {
  return {
    // Advisory lock that serializes find-or-create per variant identity.
    $executeRaw: jest.fn(),
    variant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pair: { create: jest.fn() },
    operation: { create: jest.fn() },
  };
}

/** A fixed rate keeps the arithmetic in these tests obvious: $1 = 40 ₴. */
const RATE = 40;
const exchange = { getRate: jest.fn() };

describe('IntakeService', () => {
  /** Realtime is fire-and-forget: assert it fires, never let it fail a write. */
  const realtime = { emit: jest.fn() };
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
        { provide: RealtimeGateway, useValue: realtime },
        { provide: PrismaService, useValue: { $transaction: transaction } },
        { provide: ExchangeService, useValue: exchange },
      ],
    }).compile();
    service = moduleRef.get(IntakeService);

    exchange.getRate.mockResolvedValue({
      rate: RATE,
      fetchedAt: new Date().toISOString(),
      stale: false,
    });
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
      { ...input, purchasePriceUsd: 999 },
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
    // The queue and its badge move on the dashboard right away (FR-B-04).
    expect(realtime.emit).toHaveBeenCalledWith('intake-draft');
  });

  // The admin types dollars; the books keep hryvnia. $35 × 40 = 1400 ₴.
  it('адмін з ціною в доларах: зберігає конвертовану гривню', async () => {
    tx.variant.findFirst.mockResolvedValue(null);

    await service.create({ ...input, purchasePriceUsd: 35 }, { id: 'admin', role: 'ADMIN' });

    expect(tx.variant.update).toHaveBeenCalledTimes(1);
    expect(Number(tx.variant.update.mock.calls[0][0].data.purchasePrice)).toBe(1400);
    expect(tx.pair.create.mock.calls[0][0].data.awaitingPrice).toBe(false);
    expect(Number(tx.operation.create.mock.calls[0][0].data.purchasePriceAtTime)).toBe(1400);
  });

  // «Без ціни — старий товар» is the price 0 — the same value the dashboard's
  // no-price action writes. Recording null here would leave the pair
  // indistinguishable from one nobody has priced yet (BUG-2, run 30.07.2026).
  it('адмін "без ціни — старий товар" (0): ціна варіанта стає 0, pair на складі', async () => {
    tx.variant.findFirst.mockResolvedValue({ id: 'v1' });

    await service.create({ ...input, purchasePriceUsd: 0 }, { id: 'admin', role: 'ADMIN' });

    expect(Number(tx.variant.update.mock.calls[0][0].data.purchasePrice)).toBe(0);
    expect(tx.pair.create.mock.calls[0][0].data.awaitingPrice).toBe(false);
    expect(Number(tx.operation.create.mock.calls[0][0].data.purchasePriceAtTime)).toBe(0);
  });

  it('адмін без рішення щодо ціни (null): ціна варіанта лишається недоторканою', async () => {
    tx.variant.findFirst.mockResolvedValue({ id: 'v1' });

    await service.create({ ...input, purchasePriceUsd: null }, { id: 'admin', role: 'ADMIN' });

    expect(tx.variant.update).not.toHaveBeenCalled();
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

  it('find-or-create серіалізується advisory-локом (NULL-и не рятує unique)', async () => {
    tx.variant.findFirst.mockResolvedValue(null);

    await service.create(input, { id: 'u1', role: 'SELLER' });

    // The lock is taken before the existence check, inside the same transaction.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.variant.findFirst.mock.invocationCallOrder[0]!,
    );
  });

  // «Без утеплення» is a value, so an omitted insulation must resolve to the
  // same variant as an explicit NONE — otherwise one shoe splits in two.
  it('пропущене утеплення означає NONE, а не «без значення»', async () => {
    tx.variant.findFirst.mockResolvedValue(null);

    await service.create(input, { id: 'u1', role: 'SELLER' });

    expect(tx.variant.findFirst.mock.calls[0][0].where).toEqual({
      style: '7645',
      color: '36',
      material: null,
      season: 'NONE',
    });
  });
});

describe('IntakeService.priceHint', () => {
  const variantFindFirst = jest.fn();
  let service: IntakeService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: RealtimeGateway, useValue: { emit: jest.fn() } },
        {
          provide: PrismaService,
          useValue: { variant: { findFirst: variantFindFirst } },
        },
        { provide: ExchangeService, useValue: exchange },
      ],
    }).compile();
    service = moduleRef.get(IntakeService);
    exchange.getRate.mockResolvedValue({
      rate: RATE,
      fetchedAt: new Date().toISOString(),
      stale: false,
    });
  });

  const query = { style: '7645', color: '36', material: 'LEATHER' as const };

  it('шукає за тією самою ідентичністю, що й поступлення (утеплення → NONE)', async () => {
    variantFindFirst.mockResolvedValue({ purchasePrice: 1400 });

    const res = await service.priceHint(query);

    expect(variantFindFirst.mock.calls[0][0].where).toEqual({
      style: '7645',
      color: '36',
      material: 'LEATHER',
      season: 'NONE',
    });
    // Stored 1400 ₴ read back through today's rate: $35.
    expect(res).toEqual({ purchasePriceUsd: 35 });
  });

  it('невідомий варіант — підказки немає', async () => {
    variantFindFirst.mockResolvedValue(null);

    expect(await service.priceHint(query)).toEqual({ purchasePriceUsd: null });
  });

  it('варіант без ціни — підказки немає', async () => {
    variantFindFirst.mockResolvedValue({ purchasePrice: null });

    expect(await service.priceHint(query)).toEqual({ purchasePriceUsd: null });
  });

  // 0 is «без ціни — старий товар»: a real decision, distinct from "not set yet".
  it('«без ціни — старий товар» (0) — це підказка, а не порожнеча', async () => {
    variantFindFirst.mockResolvedValue({ purchasePrice: 0 });

    // 0 needs no rate at all — the decision survives any exchange rate.
    expect(await service.priceHint(query)).toEqual({ purchasePriceUsd: 0 });
  });
});
