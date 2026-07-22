import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SaleService } from './sale.service';

function makeTx() {
  return {
    $queryRaw: jest.fn(),
    pair: { update: jest.fn() },
    operation: { create: jest.fn() },
  };
}

describe('SaleService', () => {
  let service: SaleService;
  let tx: ReturnType<typeof makeTx>;
  const transaction = jest.fn();
  const variantFindMany = jest.fn();
  const operationFindFirst = jest.fn();
  const pairFindMany = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    tx = makeTx();
    transaction.mockImplementation((cb: (client: typeof tx) => unknown) => cb(tx));
    const moduleRef = await Test.createTestingModule({
      providers: [
        SaleService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: transaction,
            variant: { findMany: variantFindMany },
            operation: { findFirst: operationFindFirst },
            pair: { findMany: pairFindMany },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(SaleService);
  });

  const stockVariant = {
    id: 'v1',
    style: '7645',
    color: '36',
    material: 'LEATHER',
    season: 'SHEEPSKIN',
    pairs: [
      { id: 'p-old', size: 38, intakeDate: new Date('2026-07-01T12:00:00Z'), awaitingPrice: false },
      { id: 'p-new', size: 38, intakeDate: new Date('2026-07-10T12:00:00Z'), awaitingPrice: false },
      { id: 'p-37', size: 37, intakeDate: new Date('2026-07-02T12:00:00Z'), awaitingPrice: true },
    ],
  };

  it('lookup: єдиний варіант → FIFO-кандидат (найстаріша пара) і підказка ціни', async () => {
    variantFindMany.mockResolvedValue([stockVariant]);
    operationFindFirst.mockResolvedValue({ salePrice: 2850 });

    const res = await service.lookup({ size: 38, color: '36', style: '7645' });

    expect(res.pair?.pairId).toBe('p-old'); // oldest of the two size-38 pairs
    expect(res.pair?.intakeDate).toBe('2026-07-01T12:00:00.000Z');
    expect(res.salePriceHint).toBe(2850);
    expect(res.combos).toEqual([{ material: 'LEATHER', season: 'SHEEPSKIN', sizes: [37, 38] }]);
    expect(res.similar).toEqual([]);
  });

  it('lookup: кілька комбінацій без фільтра → неоднозначно, pair = null (правило #5)', async () => {
    variantFindMany.mockResolvedValue([
      stockVariant,
      { ...stockVariant, id: 'v2', material: null, season: null },
    ]);
    pairFindMany.mockResolvedValue([]);

    const res = await service.lookup({ size: 38, color: '36', style: '7645' });

    expect(res.pair).toBeNull();
    expect(res.combos).toHaveLength(2);
  });

  it('lookup: фільтр material/season розвʼязує неоднозначність', async () => {
    variantFindMany.mockResolvedValue([
      stockVariant,
      { ...stockVariant, id: 'v2', material: null, season: null, pairs: [] },
    ]);
    operationFindFirst.mockResolvedValue(null);

    const res = await service.lookup({
      size: 38,
      color: '36',
      style: '7645',
      material: 'LEATHER',
      season: 'SHEEPSKIN',
    });

    expect(res.pair?.pairId).toBe('p-old');
    expect(res.salePriceHint).toBeNull();
  });

  it('lookup: нічого не знайдено → similar згруповано з кількістю пар', async () => {
    variantFindMany.mockResolvedValue([]);
    pairFindMany.mockResolvedValue([
      { size: 38, variant: { style: '9031', color: '14' } },
      { size: 39, variant: { style: '9031', color: '41' } },
      { size: 39, variant: { style: '9031', color: '41' } },
    ]);

    const res = await service.lookup({ size: 39, color: '14', style: '9031' });

    expect(res.pair).toBeNull();
    expect(res.similar).toEqual([
      { style: '9031', color: '14', size: 38, count: 1 },
      { style: '9031', color: '41', size: 39, count: 2 },
    ]);
  });

  it('продаж: пара стає SOLD, операція SALE з ціною/оплатою і зафіксованою закупкою', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'p1', status: 'IN_STOCK' }]);
    tx.pair.update.mockResolvedValue({
      size: 38,
      status: 'SOLD',
      variant: { style: '7645', color: '36', purchasePrice: 1400 },
    });

    const res = await service.sell(
      { pairId: 'p1', salePrice: 2850, paymentMethod: 'CARD' },
      'seller-1',
    );

    expect(tx.pair.update.mock.calls[0][0].data.status).toBe('SOLD');
    const op = tx.operation.create.mock.calls[0][0].data;
    expect(op.type).toBe('SALE');
    expect(Number(op.salePrice)).toBe(2850);
    expect(op.paymentMethod).toBe('CARD');
    expect(op.purchasePriceAtTime).toBe(1400);
    // Seller-safe result: no purchase price anywhere.
    expect(res).toEqual({
      pairId: 'p1',
      style: '7645',
      color: '36',
      size: 38,
      status: 'SOLD',
      salePrice: 2850,
      paymentMethod: 'CARD',
    });
  });

  it('списання: WRITTEN_OFF без ціни, з коментарем', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'p1', status: 'IN_STOCK' }]);
    tx.pair.update.mockResolvedValue({
      size: 40,
      status: 'WRITTEN_OFF',
      variant: { style: '5211', color: '44', purchasePrice: null },
    });

    const res = await service.writeoff({ pairId: 'p1', comment: 'Дефект підошви' }, 'seller-1');

    const op = tx.operation.create.mock.calls[0][0].data;
    expect(op.type).toBe('WRITEOFF');
    expect(op.salePrice).toBeNull();
    expect(op.comment).toBe('Дефект підошви');
    expect(res.salePrice).toBeNull();
    expect(res.status).toBe('WRITTEN_OFF');
  });

  it('конкурентність: пара вже не на складі → 409 (переможець один)', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'p1', status: 'SOLD' }]);

    await expect(
      service.sell({ pairId: 'p1', salePrice: 100, paymentMethod: 'CASH' }, 'seller-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pair.update).not.toHaveBeenCalled();
  });

  it('неіснуюча пара → 404', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.writeoff({ pairId: 'ghost' }, 'seller-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
