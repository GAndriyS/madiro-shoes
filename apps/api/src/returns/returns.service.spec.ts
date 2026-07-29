import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ReturnsService } from './returns.service';

function makeTx() {
  return {
    $queryRaw: jest.fn(),
    operation: { findFirst: jest.fn(), create: jest.fn() },
    pair: { update: jest.fn() },
  };
}

describe('ReturnsService', () => {
  /** Realtime is fire-and-forget: assert it fires, never let it fail a write. */
  const realtime = { emit: jest.fn() };
  let service: ReturnsService;
  let tx: ReturnType<typeof makeTx>;
  const transaction = jest.fn();
  const operationFindFirst = jest.fn();
  const variantFindMany = jest.fn();

  /** The single returnable variant behind the scanned tag — unambiguous case. */
  const leatherSheepskin = { id: 'v1', material: 'LEATHER', season: 'SHEEPSKIN' };
  const suedeNone = { id: 'v2', material: 'SUEDE', season: 'NONE' };

  beforeEach(async () => {
    jest.resetAllMocks();
    tx = makeTx();
    transaction.mockImplementation((cb: (client: typeof tx) => unknown) => cb(tx));
    variantFindMany.mockResolvedValue([leatherSheepskin]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReturnsService,
        { provide: RealtimeGateway, useValue: realtime },
        {
          provide: PrismaService,
          useValue: {
            $transaction: transaction,
            operation: { findFirst: operationFindFirst },
            variant: { findMany: variantFindMany },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(ReturnsService);
  });

  const saleOp = {
    id: 'op1',
    salePrice: 2850,
    paymentMethod: 'CARD',
    purchasePriceAtTime: 1400,
    createdAt: new Date(Date.now() - 2 * 86_400_000), // exactly 2 calendar days back
    pair: {
      id: 'p1',
      size: 38,
      variant: { style: '7645', color: '36', material: 'LEATHER', season: 'SHEEPSKIN' },
    },
    user: { name: 'Оля' },
  };

  it('lookup: повертає картку останнього продажу з днями від продажу', async () => {
    operationFindFirst.mockResolvedValue(saleOp);

    const res = await service.lookup({ size: 38, color: '36', style: '7645' });

    expect(res.sale).toMatchObject({
      operationId: 'op1',
      pairId: 'p1',
      style: '7645',
      salePrice: 2850,
      paymentMethod: 'CARD',
      sellerName: 'Оля',
      daysSince: 2,
    });
    // The query targets sold pairs of the resolved variant and takes the
    // latest sale (rule 3.3 #6).
    const where = operationFindFirst.mock.calls[0][0].where;
    expect(where.pair.status).toBe('SOLD');
    expect(where.pair.variantId).toBe('v1');
    expect(operationFindFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('lookup: продажу немає → sale null', async () => {
    variantFindMany.mockResolvedValue([]);
    operationFindFirst.mockResolvedValue(null);

    await expect(service.lookup({ size: 44, color: '00', style: '0000' })).resolves.toEqual({
      combos: [],
      sale: null,
    });
  });

  it('lookup: дві комбінації під однією біркою → sale null і комбінації на вибір', async () => {
    variantFindMany.mockResolvedValue([leatherSheepskin, suedeNone]);

    const res = await service.lookup({ size: 38, color: '36', style: '7645' });

    // Ambiguous: reversing an arbitrary one of the two sales would be wrong.
    expect(res.sale).toBeNull();
    expect(res.combos).toEqual([
      { material: 'LEATHER', season: 'SHEEPSKIN' },
      { material: 'SUEDE', season: 'NONE' },
    ]);
    expect(operationFindFirst).not.toHaveBeenCalled();
  });

  it('lookup: явні матеріал/утеплення звужують до потрібного варіанта', async () => {
    variantFindMany.mockResolvedValue([leatherSheepskin, suedeNone]);
    operationFindFirst.mockResolvedValue(saleOp);

    const res = await service.lookup({
      size: 38,
      color: '36',
      style: '7645',
      material: 'SUEDE',
      season: 'NONE',
    });

    expect(res.sale?.operationId).toBe('op1');
    expect(operationFindFirst.mock.calls[0][0].where.pair.variantId).toBe('v2');
  });

  // Material keeps the explicit-null case («матеріал не вказано» is a real
  // combination); insulation does not — «без утеплення» is the NONE value.
  it('lookup: явний null для матеріалу означає комбінацію «без значення», а не «будь-яку»', async () => {
    const noMaterial = { id: 'v3', material: null, season: 'NONE' };
    variantFindMany.mockResolvedValue([leatherSheepskin, noMaterial]);
    operationFindFirst.mockResolvedValue(saleOp);

    await service.lookup({
      size: 38,
      color: '36',
      style: '7645',
      material: null,
      season: 'NONE',
    });

    expect(operationFindFirst.mock.calls[0][0].where.pair.variantId).toBe('v3');
  });

  it('повернення: пара знову IN_STOCK, RETURN копіює ціну/оплату/закупку продажу', async () => {
    tx.operation.findFirst.mockResolvedValue(saleOp);
    tx.$queryRaw.mockResolvedValue([{ id: 'p1', status: 'SOLD' }]);
    tx.pair.update.mockResolvedValue({
      id: 'p1',
      size: 38,
      status: 'IN_STOCK',
      variant: { style: '7645', color: '36' },
    });

    const res = await service.register('op1', 'seller-1');

    expect(tx.pair.update.mock.calls[0][0].data).toEqual({ status: 'IN_STOCK' });
    const op = tx.operation.create.mock.calls[0][0].data;
    expect(op.type).toBe('RETURN');
    expect(op.salePrice).toBe(2850); // stored positive — read paths subtract
    expect(op.paymentMethod).toBe('CARD');
    expect(op.purchasePriceAtTime).toBe(1400);
    expect(res).toEqual({
      pairId: 'p1',
      style: '7645',
      color: '36',
      size: 38,
      status: 'IN_STOCK',
      salePrice: 2850,
      paymentMethod: 'CARD',
    });
    // The dashboard feed and KPIs must move without a reload (FR-B-04).
    expect(realtime.emit).toHaveBeenCalledWith('return');
  });

  it('подвійне повернення: пара вже не SOLD → 409', async () => {
    tx.operation.findFirst.mockResolvedValue(saleOp);
    tx.$queryRaw.mockResolvedValue([{ id: 'p1', status: 'IN_STOCK' }]);

    await expect(service.register('op1', 'seller-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pair.update).not.toHaveBeenCalled();
    // A rejected return announces nothing.
    expect(realtime.emit).not.toHaveBeenCalled();
  });

  it('невідома операція → 404', async () => {
    tx.operation.findFirst.mockResolvedValue(null);

    await expect(service.register('ghost', 'seller-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
