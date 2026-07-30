import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLIENT_HEADER, checkoutResultSchema, returnLookupResponseSchema } from '@madiro/shared';
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
      .set(CLIENT_HEADER, 'scanner')
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

  it('дві комбінації під однією біркою: без уточнення — sale null, з уточненням — саме той продаж', async () => {
    // Same style·color·size as the leather pair above, but suede without
    // insulation: the tag cannot tell them apart, so the seller must choose.
    const suede = await prisma.variant.create({
      data: { style: '7645', color: '36', material: 'SUEDE', season: 'NONE' },
    });
    const seller = await prisma.user.findFirstOrThrow({ where: { login: 'seller-ret' } });
    const suedePair = await prisma.pair.create({
      data: { variantId: suede.id, size: 38, status: 'SOLD', createdById: seller.id },
    });
    await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: suedePair.id,
        userId: seller.id,
        salePrice: 3300,
        paymentMethod: 'CASH',
      },
    });

    // Ambiguous: the suede sale is the newest, but returning it blindly could
    // reverse the wrong pair — the API asks instead of guessing.
    const ambiguous = returnLookupResponseSchema.parse((await lookup().expect(200)).body);
    expect(ambiguous.sale).toBeNull();
    expect(ambiguous.combos).toHaveLength(2);
    expect(ambiguous.combos).toContainEqual({ material: 'SUEDE', season: 'NONE' });
    expect(ambiguous.combos).toContainEqual({ material: 'LEATHER', season: 'SHEEPSKIN' });

    // Narrowed to leather: the older 2000 sale, NOT the newer suede one.
    const leather = returnLookupResponseSchema.parse(
      (
        await request(http)
          .post('/api/returns/lookup')
          .set('Authorization', `Bearer ${token}`)
          .send({ size: 38, color: '36', style: '7645', material: 'LEATHER', season: 'SHEEPSKIN' })
          .expect(200)
      ).body,
    );
    expect(leather.sale?.salePrice).toBe(2000);

    const suedeFound = returnLookupResponseSchema.parse(
      (
        await request(http)
          .post('/api/returns/lookup')
          .set('Authorization', `Bearer ${token}`)
          .send({ size: 38, color: '36', style: '7645', material: 'SUEDE', season: 'NONE' })
          .expect(200)
      ).body,
    );
    expect(suedeFound.sale?.salePrice).toBe(3300);
    expect(suedeFound.sale?.pairId).toBe(suedePair.id);
  });

  /**
   * BUG-4 of the 30.07.2026 run: whoever is at the counter processes the
   * return, but the money must come off the seller who made the sale.
   * Otherwise a seller who helps a colleague watches their own day go
   * negative for revenue they never earned.
   */
  it('повернення чужого продажу віднімається в автора продажу, не в того, хто оформив', async () => {
    const [author, clerk] = await Promise.all([
      prisma.user.create({
        data: {
          login: 'seller-author',
          name: 'Ірина',
          role: 'SELLER',
          passwordHash: await argon2.hash(password),
        },
      }),
      prisma.user.create({
        data: {
          login: 'seller-clerk',
          name: 'Оля-каса',
          role: 'SELLER',
          passwordHash: await argon2.hash(password),
        },
      }),
    ]);

    const variant = await prisma.variant.findFirstOrThrow({ where: { style: '7645' } });
    const pair = await prisma.pair.create({
      data: { variantId: variant.id, size: 41, status: 'SOLD', createdById: author.id },
    });
    const sale = await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: pair.id,
        userId: author.id,
        salePrice: 1500,
        paymentMethod: 'CASH',
      },
    });

    const tokenOf = async (login: string): Promise<string> =>
      (
        await request(http)
          .post('/api/auth/login')
          .set(CLIENT_HEADER, 'scanner')
          .send({ login, password })
          .expect(200)
      ).body.accessToken as string;
    const [authorToken, clerkToken] = await Promise.all([
      tokenOf('seller-author'),
      tokenOf('seller-clerk'),
    ]);

    await request(http)
      .post('/api/returns')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ operationId: sale.id })
      .expect(201);

    const ret = await prisma.operation.findFirstOrThrow({
      where: { pairId: pair.id, type: 'RETURN' },
    });
    // The journal still records who did it…
    expect(ret.userId).toBe(clerk.id);
    // …while the figures follow the sale.
    expect(ret.attributedToId).toBe(author.id);

    const clerkSummary = await request(http)
      .get('/api/me/summary')
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);
    expect(clerkSummary.body).toMatchObject({ todaySalesPairs: 0, todaySalesTotal: 0 });

    const authorSales = await request(http)
      .get('/api/me/sales?period=today')
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);
    // Sale +1500 and its reversal −1500 both belong to the author: net zero.
    expect(authorSales.body).toMatchObject({ pairs: 0, total: 0 });
    expect(authorSales.body.items.map((i: { amount: number }) => i.amount)).toEqual([-1500, 1500]);
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
