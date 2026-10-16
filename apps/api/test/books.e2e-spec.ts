import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CLIENT_HEADER,
  OVERVIEW_MAX_RANGE_DAYS,
  intakeResultSchema,
  overviewResponseSchema,
  variantDetailSchema,
} from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { shiftDateKey, storeDateKey } from '../src/lib/time';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';

/** Pinned for the whole suite in test/setup-e2e.ts. */
const RATE = 40;

/**
 * The shop's books over real Postgres: margin, the movement journal and the
 * overview's period. Each case starts from empty stock, so the figures it
 * asserts are exactly the ones it booked.
 */
describe('Books integrity (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  let adminToken: string;
  let sellerToken: string;
  const password = 'books-e2e-pass';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    http = app.getHttpServer() as Server;

    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    const passwordHash = await argon2.hash(password);
    await prisma.user.create({
      data: { login: 'admin-books', name: 'Адмін', role: 'ADMIN', passwordHash },
    });
    await prisma.user.create({
      data: { login: 'seller-books', name: 'Оля', role: 'SELLER', passwordHash },
    });

    const login = async (loginName: string, client: 'scanner' | 'dashboard') =>
      (
        await request(http)
          .post('/api/auth/login')
          .set(CLIENT_HEADER, client)
          .send({ login: loginName, password })
          .expect(200)
      ).body.accessToken as string;
    adminToken = await login('admin-books', 'dashboard');
    sellerToken = await login('seller-books', 'scanner');
  });

  beforeEach(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
  });

  afterAll(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
  const asSeller = (req: request.Test) => req.set('Authorization', `Bearer ${sellerToken}`);

  /** One pair through POST /intake; a seller's is a draft, an admin's is priced. */
  const intake = async (
    who: 'admin' | 'seller',
    style: string,
    purchasePriceUsd?: number,
  ): Promise<string> => {
    const req = request(http).post('/api/intake');
    const res = await (who === 'admin' ? asAdmin(req) : asSeller(req))
      .send({
        sizes: [{ size: 38, qty: 1 }],
        color: '10',
        style,
        ...(purchasePriceUsd !== undefined ? { purchasePriceUsd } : {}),
      })
      .expect(201);
    return intakeResultSchema.parse(res.body).pairs[0]!.pairId;
  };

  const sell = async (pairId: string, salePrice: number): Promise<string> => {
    await asSeller(request(http).post('/api/sale'))
      .send({ pairId, salePrice, paymentMethod: 'CASH' })
      .expect(201);
    const sale = await prisma.operation.findFirstOrThrow({
      where: { pairId, type: 'SALE' },
      orderBy: { createdAt: 'desc' },
    });
    return sale.id;
  };

  const giveBack = async (saleId: string): Promise<void> => {
    await asSeller(request(http).post('/api/returns')).send({ operationId: saleId }).expect(201);
  };

  const overview = async (query = 'period=today') =>
    overviewResponseSchema.parse(
      (await asAdmin(request(http).get(`/api/stats/overview?${query}`)).expect(200)).body,
    );

  describe('маржа: «без ціни — старий товар» (spec §2.2 #4, FR-B-05)', () => {
    it('продаж пари з ціною 0 не дає маржі, а йде в рядок «без ціни закупки»', async () => {
      // The repro: old stock (price 0) sold at 2000 used to report a margin of
      // 2000 — 100% — booking the whole sale price as profit.
      const oldStock = await intake('admin', '2001', 0);
      const priced = await intake('admin', '2002', 1000 / RATE);
      const draft = await intake('seller', '2003');

      await sell(oldStock, 2000);
      await sell(priced, 1500);
      await sell(draft, 800);

      const kpi = await overview();
      expect(kpi.revenue).toBe(2000 + 1500 + 800);
      expect(kpi.margin).toBe(500); // only the priced pair: 1500 − 1000
      // Over the revenue that has a basis, not over all of it.
      expect(kpi.marginPctOfRevenue).toBe(Math.round((500 / 1500) * 100));
      expect(kpi.soldWithoutBasis).toEqual({ pairs: 2, revenue: 2000 + 800 });

      const oldStockSale = kpi.recentOperations.find(
        (op) => op.type === 'SALE' && op.style === '2001',
      )!;
      expect(oldStockSale.amount).toBe(2000);
      expect(oldStockSale.margin).toBeNull();
      expect(
        kpi.recentOperations.find((op) => op.style === '2002' && op.type === 'SALE')!.margin,
      ).toBe(500);
    });

    it('лише старий товар: маржа 0, відсотка немає, а не 100%', async () => {
      await sell(await intake('admin', '2004', 0), 2000);

      const kpi = await overview();
      expect(kpi.margin).toBe(0);
      expect(kpi.marginPctOfRevenue).toBeNull();
      expect(kpi.soldWithoutBasis).toEqual({ pairs: 1, revenue: 2000 });
    });

    it('повернення віднімається і з рядка «без ціни закупки»', async () => {
      const first = await sell(await intake('admin', '2005', 0), 2000);
      await sell(await intake('admin', '2006', 0), 1200);
      await giveBack(first);

      const kpi = await overview();
      expect(kpi.revenue).toBe(1200);
      expect(kpi.soldWithoutBasis).toEqual({ pairs: 1, revenue: 1200 });
    });
  });

  describe('скасування: лише останній рух пари (FR-D-07)', () => {
    it('продаж → повернення → продаж: перший продаж не скасовується, книги цілі', async () => {
      const pairId = await intake('admin', '3001', 1000 / RATE);
      const s1 = await sell(pairId, 2000);
      await giveBack(s1);
      const s2 = await sell(pairId, 2100);

      // The repro: this used to answer 200 and put the pair back on the shelf
      // while S2 and the return both stayed on the books.
      await asAdmin(request(http).post(`/api/stock/operations/${s1}/cancel`)).expect(409);

      const pair = await prisma.pair.findUniqueOrThrow({ where: { id: pairId } });
      expect(pair.status).toBe('SOLD');
      const active = await prisma.operation.findMany({ where: { pairId, cancelledAt: null } });
      expect(active.map((op) => op.type).sort()).toEqual(['INTAKE', 'RETURN', 'SALE', 'SALE']);

      // The drawer offers exactly the cancellation the server accepts.
      const variant = await prisma.pair.findUniqueOrThrow({ where: { id: pairId } });
      const detail = variantDetailSchema.parse(
        (await asAdmin(request(http).get(`/api/stock/variants/${variant.variantId}`)).expect(200))
          .body,
      );
      expect(detail.history.filter((h) => h.canCancel).map((h) => h.id)).toEqual([s2]);

      // The latest sale is still reversible, and after it the first one is not.
      await asAdmin(request(http).post(`/api/stock/operations/${s2}/cancel`)).expect(200);
      expect((await prisma.pair.findUniqueOrThrow({ where: { id: pairId } })).status).toBe(
        'IN_STOCK',
      );
      await asAdmin(request(http).post(`/api/stock/operations/${s1}/cancel`)).expect(409);
    });
  });

  describe('історія руху не видаляється (FR-B-06)', () => {
    /** A seller's draft that was sold and returned: back in stock, still awaiting a price. */
    const soldAndReturnedDraft = async (): Promise<string> => {
      const pairId = await intake('seller', '4001');
      await giveBack(await sell(pairId, 1800));
      const pair = await prisma.pair.findUniqueOrThrow({ where: { id: pairId } });
      expect(pair).toMatchObject({ status: 'IN_STOCK', awaitingPrice: true });
      return pairId;
    };

    it('продавець не може видалити чернетку, яку вже продавали й повертали', async () => {
      const pairId = await soldAndReturnedDraft();

      // The repro: 200, and all three operations were gone.
      await asSeller(request(http).delete(`/api/intake/${pairId}`)).expect(409);

      expect(await prisma.operation.count({ where: { pairId } })).toBe(3);
      expect(await prisma.pair.findUnique({ where: { id: pairId } })).not.toBeNull();
    });

    it('продавець не може перенести таку чернетку на інший варіант разом з продажами', async () => {
      const pairId = await soldAndReturnedDraft();
      const before = await prisma.pair.findUniqueOrThrow({ where: { id: pairId } });

      await asSeller(request(http).patch(`/api/intake/${pairId}`))
        .send({ size: 39, color: '20', style: '4002' })
        .expect(409);

      const after = await prisma.pair.findUniqueOrThrow({ where: { id: pairId } });
      expect(after).toMatchObject({ variantId: before.variantId, size: before.size });
    });

    it('адмін не може видалити пару з продажем чи списанням — ні на складі, ні поза ним', async () => {
      const returned = await soldAndReturnedDraft();
      const sold = await intake('admin', '4003', 1000 / RATE);
      await sell(sold, 2000);
      const writtenOff = await intake('admin', '4004', 1000 / RATE);
      await asSeller(request(http).post('/api/sale/writeoff'))
        .send({ pairId: writtenOff })
        .expect(201);

      for (const pairId of [returned, sold, writtenOff]) {
        const before = await prisma.operation.count({ where: { pairId } });
        await asAdmin(request(http).delete(`/api/stock/pairs/${pairId}`)).expect(409);
        expect(await prisma.operation.count({ where: { pairId } })).toBe(before);
      }
    });

    it('скасований продаж — теж історія: пару з ним не видалити', async () => {
      const pairId = await intake('admin', '4005', 1000 / RATE);
      const sale = await sell(pairId, 2000);
      await asAdmin(request(http).post(`/api/stock/operations/${sale}/cancel`)).expect(200);

      await asAdmin(request(http).delete(`/api/stock/pairs/${pairId}`)).expect(409);
      expect(await prisma.operation.findUnique({ where: { id: sale } })).not.toBeNull();
    });

    it('помилково заведену пару (лише INTAKE) видалити можна, і дашборди про це дізнаються', async () => {
      const pairId = await intake('admin', '4006', 1000 / RATE);
      const emit = jest.spyOn(app.get(RealtimeGateway), 'emit');

      await asAdmin(request(http).delete(`/api/stock/pairs/${pairId}`)).expect(200);

      expect(await prisma.pair.findUnique({ where: { id: pairId } })).toBeNull();
      expect(await prisma.operation.count({ where: { pairId } })).toBe(0);
      expect(emit).toHaveBeenCalledWith('pair-deleted');
      emit.mockRestore();
    });

    it('чернетку без руху продавець і далі редагує й видаляє', async () => {
      const pairId = await intake('seller', '4007');

      await asSeller(request(http).patch(`/api/intake/${pairId}`))
        .send({ size: 39, color: '10', style: '4007' })
        .expect(200);
      await asSeller(request(http).delete(`/api/intake/${pairId}`)).expect(200);
      expect(await prisma.pair.findUnique({ where: { id: pairId } })).toBeNull();
    });
  });

  describe('поступлення адміна без ціни (FR-B-02)', () => {
    it('адмін без purchasePriceUsd → 400, нічого не створено', async () => {
      // The repro: 201 with awaitingPrice false and a null price — a pair that
      // never reaches the queue and so never gets a margin basis.
      const res = await asAdmin(request(http).post('/api/intake'))
        .send({ sizes: [{ size: 38, qty: 1 }], color: '10', style: '5001' })
        .expect(400);
      expect(res.body.errors).toEqual([{ path: 'purchasePriceUsd', message: expect.any(String) }]);
      await asAdmin(request(http).post('/api/intake'))
        .send({ sizes: [{ size: 38, qty: 1 }], color: '10', style: '5001', purchasePriceUsd: null })
        .expect(400);

      expect(await prisma.pair.count()).toBe(0);
      expect(await prisma.variant.count()).toBe(0);
    });

    it('адмін з ціною 0 — свідоме «без ціни»: не чернетка, ціна варіанта 0', async () => {
      const pairId = await intake('admin', '5002', 0);

      const pair = await prisma.pair.findUniqueOrThrow({
        where: { id: pairId },
        include: { variant: true },
      });
      expect(pair.awaitingPrice).toBe(false);
      expect(Number(pair.variant.purchasePrice)).toBe(0);
    });

    it('продавець і далі створює чернетку без ціни', async () => {
      const pairId = await intake('seller', '5003');
      expect((await prisma.pair.findUniqueOrThrow({ where: { id: pairId } })).awaitingPrice).toBe(
        true,
      );
    });
  });

  describe('огляд: довільний період (FR-D-02)', () => {
    const custom = (from?: string, to?: string) => {
      const params = new URLSearchParams({ period: 'custom' });
      if (from != null) params.set('from', from);
      if (to != null) params.set('to', to);
      return asAdmin(request(http).get(`/api/stats/overview?${params}`));
    };

    it('початок пізніше за кінець → 400, а не 500', async () => {
      const res = await custom('2026-10-15', '2026-10-01').expect(400);
      expect(res.body.errors).toEqual([{ path: 'from', message: expect.any(String) }]);
    });

    it('некоректна чи неіснуюча дата → 400, а не 500', async () => {
      await custom('yesterday', '2026-10-01').expect(400);
      await custom('2026-02-30', '2026-03-05').expect(400);
      await custom('2026-10-01', '2026-13-01').expect(400);
      await asAdmin(request(http).get('/api/stats/overview?period=custom&from=1&from=2')).expect(
        400,
      );
    });

    it(`період довший за ${OVERVIEW_MAX_RANGE_DAYS} днів → 400`, async () => {
      await custom('2024-01-01', '2025-01-01').expect(400);
    });

    it('лише «від» у майбутньому — теж період навиворіт → 400', async () => {
      await custom(shiftDateKey(storeDateKey(), 5)).expect(400);
    });

    it('коректний період: по стовпчику на кожен день, навіть на рік', async () => {
      const week = await overview('period=custom&from=2026-10-01&to=2026-10-07');
      expect(week.revenueSeries.points).toHaveLength(7);

      // The chart used to stop at 92 days while the KPIs covered the range.
      const year = await overview('period=custom&from=2025-01-01&to=2025-12-31');
      expect(year.revenueSeries.points).toHaveLength(365);
    });

    it('лише «до»: два тижні, що закінчуються цим днем', async () => {
      const res = await overview('period=custom&to=2026-10-14');
      expect(res.revenueSeries.points).toHaveLength(14);
    });
  });
});
