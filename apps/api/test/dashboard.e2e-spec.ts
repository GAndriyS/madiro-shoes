import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  intakeHistoryResponseSchema,
  intakeQueueResponseSchema,
  overviewResponseSchema,
  stockListResponseSchema,
  variantDetailSchema,
} from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Dashboard endpoints over real Postgres: stock table, variant detail, price
 * confirmation, intake queue/history and the overview — all admin-only
 * (FR-B-02: a seller gets 403 everywhere here).
 */
describe('Dashboard (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  let adminToken: string;
  let sellerToken: string;
  let pricedVariantId: string;
  let draftVariantId: string;
  let stockPairId: string;
  const password = 'e2e-password';

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
    const admin = await prisma.user.create({
      data: { login: 'admin-dash', name: 'Адмін', role: 'ADMIN', passwordHash },
    });
    const seller = await prisma.user.create({
      data: { login: 'seller-dash', name: 'Оля', role: 'SELLER', passwordHash },
    });

    // Priced variant: two in-stock pairs, one sold with a SALE op (revenue 2850, margin 1450).
    const priced = await prisma.variant.create({
      data: {
        style: '7645',
        color: '36',
        material: 'LEATHER',
        season: 'SHEEPSKIN',
        purchasePrice: 1400,
      },
    });
    pricedVariantId = priced.id;
    const stockPair = await prisma.pair.create({
      data: { variantId: priced.id, size: 38, createdById: admin.id },
    });
    stockPairId = stockPair.id;
    await prisma.operation.create({
      data: { type: 'INTAKE', pairId: stockPair.id, userId: admin.id, purchasePriceAtTime: 1400 },
    });
    await prisma.pair.create({ data: { variantId: priced.id, size: 39, createdById: admin.id } });
    const sold = await prisma.pair.create({
      data: { variantId: priced.id, size: 37, status: 'SOLD', createdById: admin.id },
    });
    await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: sold.id,
        userId: seller.id,
        salePrice: 2850,
        paymentMethod: 'CARD',
        purchasePriceAtTime: 1400,
      },
    });

    // Draft variant: one awaiting pair (draft INTAKE, null basis) + one sold-before-pricing.
    const draft = await prisma.variant.create({
      data: { style: '5211', color: '44', material: 'SUEDE', season: 'BAIKA' },
    });
    draftVariantId = draft.id;
    const awaiting = await prisma.pair.create({
      data: { variantId: draft.id, size: 36, awaitingPrice: true, createdById: seller.id },
    });
    await prisma.operation.create({
      data: { type: 'INTAKE', pairId: awaiting.id, userId: seller.id },
    });
    const soldDraft = await prisma.pair.create({
      data: {
        variantId: draft.id,
        size: 40,
        status: 'SOLD',
        awaitingPrice: true,
        createdById: seller.id,
      },
    });
    await prisma.operation.create({
      data: { type: 'INTAKE', pairId: soldDraft.id, userId: seller.id },
    });
    await prisma.operation.create({
      data: { type: 'SALE', pairId: soldDraft.id, userId: seller.id, salePrice: 4100 },
    });

    const login = async (loginName: string) =>
      (await request(http).post('/api/auth/login').send({ login: loginName, password }).expect(200))
        .body.accessToken as string;
    adminToken = await login('admin-dash');
    sellerToken = await login('seller-dash');
  });

  afterAll(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  it('продавцю всі дашбордні ендпоінти закриті (403)', async () => {
    for (const path of [
      '/api/stock/variants',
      `/api/stock/variants/${pricedVariantId}`,
      '/api/intake/queue',
      '/api/intake/history',
      '/api/stats/overview',
    ]) {
      await request(http).get(path).set('Authorization', `Bearer ${sellerToken}`).expect(403);
    }
  });

  it('склад: рядки-варіанти лише з парами на складі, фільтри й підсумок', async () => {
    const res = await asAdmin(request(http).get('/api/stock/variants')).expect(200);
    const parsed = stockListResponseSchema.parse(res.body);

    expect(parsed.total).toBe(2);
    const pricedRow = parsed.items.find((r) => r.style === '7645')!;
    expect(pricedRow.pairsCount).toBe(2); // sold pair excluded
    expect(pricedRow.sizes).toEqual([38, 39]);
    expect(pricedRow.purchasePrice).toBe(1400);
    expect(pricedRow.lastSalePrice).toBe(2850);
    const draftRow = parsed.items.find((r) => r.style === '5211')!;
    expect(draftRow.awaitingPriceCount).toBe(1); // only the in-stock awaiting pair
    expect(parsed.summary.pairsTotal).toBe(3);
    expect(parsed.queueVariants).toBe(1);

    const filtered = stockListResponseSchema.parse(
      (await asAdmin(request(http).get('/api/stock/variants?awaitingPrice=true')).expect(200)).body,
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]!.style).toBe('5211');
  });

  it('деталі варіанта: пари, історія з підписаними сумами, KPI', async () => {
    const res = await asAdmin(request(http).get(`/api/stock/variants/${pricedVariantId}`)).expect(
      200,
    );
    const parsed = variantDetailSchema.parse(res.body);

    expect(parsed.pairs).toHaveLength(2);
    expect(parsed.lastSalePrice).toBe(2850);
    expect(parsed.soldLast30Days).toBe(1);
    const sale = parsed.history.find((h) => h.type === 'SALE')!;
    expect(sale.amount).toBe(2850);
    expect(sale.actorName).toBe('Оля');
  });

  it('черга поступлень: групування за варіантом, продана-до-ціни пара з міткою', async () => {
    const res = await asAdmin(request(http).get('/api/intake/queue')).expect(200);
    const parsed = intakeQueueResponseSchema.parse(res.body);

    expect(parsed.summary).toEqual({ awaitingPairs: 2, variants: 1, sellers: 1 });
    const item = parsed.items[0]!;
    expect(item.style).toBe('5211');
    expect(item.sellerName).toBe('Оля');
    const soldSize = item.sizes.find((s) => s.sold)!;
    expect(soldSize.size).toBe(40);
    expect(soldSize.soldPrice).toBe(4100);
  });

  it('встановлення ціни: знімає очікування, бекфілить basis INTAKE, історія поповнюється', async () => {
    await asAdmin(request(http).patch(`/api/stock/variants/${draftVariantId}/price`))
      .send({ purchasePrice: 900 })
      .expect(200);

    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: draftVariantId } });
    expect(Number(variant.purchasePrice)).toBe(900);
    expect(
      await prisma.pair.count({ where: { variantId: draftVariantId, awaitingPrice: true } }),
    ).toBe(0);
    const intakes = await prisma.operation.findMany({
      where: { type: 'INTAKE', pair: { variantId: draftVariantId } },
    });
    for (const op of intakes) {
      expect(Number(op.purchasePriceAtTime)).toBe(900);
    }

    const queue = intakeQueueResponseSchema.parse(
      (await asAdmin(request(http).get('/api/intake/queue')).expect(200)).body,
    );
    expect(queue.summary.awaitingPairs).toBe(0);

    const history = intakeHistoryResponseSchema.parse(
      (await asAdmin(request(http).get('/api/intake/history')).expect(200)).body,
    );
    expect(history.total).toBe(3); // all intakes confirmed now
    expect(history.monthSummary.pairs).toBe(3);
    expect(history.monthSummary.total).toBe(1400 + 900 + 900);
  });

  it('огляд: KPI за сьогодні, серія, черга порожня після підтвердження', async () => {
    const res = await asAdmin(request(http).get('/api/stats/overview?period=today')).expect(200);
    const parsed = overviewResponseSchema.parse(res.body);

    expect(parsed.revenue).toBe(2850 + 4100);
    expect(parsed.sales).toBe(2);
    expect(parsed.returns).toBe(0);
    expect(parsed.netPairs).toBe(2);
    // Margin counts only ops with a frozen basis: 2850−1400 (the draft sale had none).
    expect(parsed.margin).toBe(1450);
    expect(parsed.revenueSeries.granularity).toBe('hour');
    expect(parsed.revenueSeries.points.reduce((s, p) => s + p.revenue, 0)).toBe(6950);
    expect(parsed.awaitingPrice.pairs).toBe(0);
    expect(parsed.recentOperations.length).toBeGreaterThan(0);
  });

  it('без ціни (старий товар) і видалення пари', async () => {
    // Re-arm one draft on the priced variant, then confirm as no-price.
    const extra = await prisma.pair.create({
      data: { variantId: pricedVariantId, size: 41, awaitingPrice: true },
    });
    await prisma.operation.create({
      data: {
        type: 'INTAKE',
        pairId: extra.id,
        userId: (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })).id,
      },
    });

    await asAdmin(request(http).post(`/api/stock/variants/${pricedVariantId}/no-price`)).expect(
      201,
    );
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: pricedVariantId } });
    expect(Number(variant.purchasePrice)).toBe(0);

    await asAdmin(request(http).delete(`/api/stock/pairs/${stockPairId}`)).expect(200);
    expect(await prisma.pair.findUnique({ where: { id: stockPairId } })).toBeNull();
    expect(await prisma.operation.findFirst({ where: { pairId: stockPairId } })).toBeNull();
  });
});
