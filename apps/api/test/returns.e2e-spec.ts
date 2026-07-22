import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { checkoutResultSchema, returnLookupResponseSchema } from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Customer return over the full app against real Postgres (FR-S-14): the last
 * sale is found by tag, the same pair flips back to IN_STOCK (awaitingPrice
 * restored for draft sales, rule 3.3 #7), and stats read paths net out.
 */
describe('Returns (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  let token: string;
  const password = 'seller-e2e-pass';

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
    const seller = await prisma.user.create({
      data: {
        login: 'seller-ret',
        name: 'Оля',
        role: 'SELLER',
        passwordHash: await argon2.hash(password),
      },
    });

    const variant = await prisma.variant.create({
      data: { style: '7645', color: '36', material: 'LEATHER', season: 'SHEEPSKIN' },
    });
    // Two sales of identical pairs at different times — lookup must take the LATEST.
    const olderPair = await prisma.pair.create({
      data: { variantId: variant.id, size: 38, status: 'SOLD', createdById: seller.id },
    });
    await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: olderPair.id,
        userId: seller.id,
        salePrice: 2000,
        paymentMethod: 'CASH',
        createdAt: new Date(Date.now() - 5 * 86_400_000),
      },
    });
    // The latest sale is of a DRAFT pair (awaitingPrice) — return must restore it.
    const draftPair = await prisma.pair.create({
      data: {
        variantId: variant.id,
        size: 38,
        status: 'SOLD',
        awaitingPrice: true,
        createdById: seller.id,
      },
    });
    await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: draftPair.id,
        userId: seller.id,
        salePrice: 2850,
        paymentMethod: 'CARD',
      },
    });

    const login = await request(http)
      .post('/api/auth/login')
      .send({ login: 'seller-ret', password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const lookup = () =>
    request(http)
      .post('/api/returns/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({ size: 38, color: '36', style: '7645' });

  it('lookup: бере ОСТАННІЙ продаж (правило #6) з карткою продавця й днями', async () => {
    const res = await lookup().expect(200);
    const parsed = returnLookupResponseSchema.parse(res.body);

    expect(parsed.sale).toMatchObject({
      style: '7645',
      size: 38,
      salePrice: 2850, // the newer CARD sale, not the older 2000 CASH one
      paymentMethod: 'CARD',
      sellerName: 'Оля',
      daysSince: 0,
    });
  });

  it('повернення: пара знову на складі, awaitingPrice відновлено (правило #7), summary в нулі', async () => {
    const found = returnLookupResponseSchema.parse((await lookup().expect(200)).body);
    const { operationId, pairId } = found.sale!;

    const res = await request(http)
      .post('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ operationId })
      .expect(201);
    const result = checkoutResultSchema.parse(res.body);
    expect(result.status).toBe('IN_STOCK');
    expect(result.salePrice).toBe(2850);

    const pair = await prisma.pair.findUniqueOrThrow({ where: { id: pairId } });
    expect(pair.status).toBe('IN_STOCK');
    expect(pair.awaitingPrice).toBe(true); // draft status restored

    const ret = await prisma.operation.findFirstOrThrow({ where: { pairId, type: 'RETURN' } });
    expect(Number(ret.salePrice)).toBe(2850); // stored positive
    expect(ret.paymentMethod).toBe('CARD');

    // Today's net: the seeded sale (+1 / +2850) − this return (−1 / −2850) = 0;
    // the older sale is 5 days back and out of the window.
    const summary = await request(http)
      .get('/api/me/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(summary.body.todaySalesPairs).toBe(0);
    expect(summary.body.todaySalesTotal).toBe(0);
  });

  it('подвійне повернення тієї ж операції → 409', async () => {
    // After the return above the pair is IN_STOCK — the same operation cannot be reversed twice.
    const sales = await prisma.operation.findMany({ where: { type: 'SALE' } });
    const latest = sales.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;

    await request(http)
      .post('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ operationId: latest.id })
      .expect(409);
  });

  it('lookup після повернення: залишився старіший продаж', async () => {
    const res = await lookup().expect(200);
    const parsed = returnLookupResponseSchema.parse(res.body);

    expect(parsed.sale?.salePrice).toBe(2000); // the older sale is now the latest SOLD match
    expect(parsed.sale?.daysSince).toBe(5);
  });

  it('без токена → 401; невалідне тіло → 400', async () => {
    await request(http)
      .post('/api/returns/lookup')
      .send({ size: 38, color: '36', style: '7645' })
      .expect(401);
    await request(http)
      .post('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });
});
