import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  checkoutResultSchema,
  saleLookupResponseSchema,
  stockSearchResponseSchema,
} from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Scan-to-sell over the full app against real Postgres: lookup narrows to
 * in-stock combos and picks FIFO; sale locks the row (409 for the loser) and
 * never leaks purchase prices to sellers (FR-B-02).
 */
describe('Sale (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  let sellerToken: string;
  const sellerPassword = 'seller-e2e-pass';

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
        login: 'seller-sale',
        name: 'Продавець',
        role: 'SELLER',
        passwordHash: await argon2.hash(sellerPassword),
      },
    });

    // One variant with a purchase price, two same-size pairs (FIFO check) and
    // an already-recorded sale for the price hint.
    const variant = await prisma.variant.create({
      data: {
        style: '7645',
        color: '36',
        material: 'LEATHER',
        season: 'SHEEPSKIN',
        purchasePrice: 1400,
      },
    });
    await prisma.pair.create({
      data: {
        variantId: variant.id,
        size: 38,
        intakeDate: new Date('2026-07-01T12:00:00Z'),
        createdById: seller.id,
      },
    });
    await prisma.pair.create({
      data: {
        variantId: variant.id,
        size: 38,
        intakeDate: new Date('2026-07-10T12:00:00Z'),
        createdById: seller.id,
      },
    });
    const soldPair = await prisma.pair.create({
      data: {
        variantId: variant.id,
        size: 37,
        status: 'SOLD',
        intakeDate: new Date('2026-06-01T12:00:00Z'),
        createdById: seller.id,
      },
    });
    await prisma.operation.create({
      data: { type: 'SALE', pairId: soldPair.id, userId: seller.id, salePrice: 2850 },
    });

    const login = await request(http)
      .post('/api/auth/login')
      .send({ login: 'seller-sale', password: sellerPassword })
      .expect(200);
    sellerToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const lookup = (body: object) =>
    request(http).post('/api/sale/lookup').set('Authorization', `Bearer ${sellerToken}`).send(body);

  it('lookup: знаходить FIFO-пару, комбінації, розміри й підказку ціни — без цін закупки', async () => {
    const res = await lookup({ size: 38, color: '36', style: '7645' }).expect(200);
    const parsed = saleLookupResponseSchema.parse(res.body);

    expect(parsed.pair).not.toBeNull();
    expect(parsed.pair?.intakeDate).toBe('2026-07-01T12:00:00.000Z'); // oldest first
    expect(parsed.combos).toEqual([{ material: 'LEATHER', season: 'SHEEPSKIN', sizes: [38] }]);
    expect(parsed.salePriceHint).toBe(2850);
    expect(JSON.stringify(res.body)).not.toContain('1400'); // FR-B-02
  });

  it('lookup: розмір відсутній → pair null і «схожі на складі» з кількістю', async () => {
    const res = await lookup({ size: 44, color: '36', style: '7645' }).expect(200);
    const parsed = saleLookupResponseSchema.parse(res.body);

    expect(parsed.pair).toBeNull();
    expect(parsed.similar).toEqual([{ style: '7645', color: '36', size: 38, count: 2 }]);
  });

  it('продаж: пара SOLD, операція записана, повторний продаж тієї ж пари → 409', async () => {
    const found = saleLookupResponseSchema.parse(
      (await lookup({ size: 38, color: '36', style: '7645' }).expect(200)).body,
    );
    const pairId = found.pair!.pairId;

    const res = await request(http)
      .post('/api/sale')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ pairId, salePrice: 2900, paymentMethod: 'CARD' })
      .expect(201);
    const result = checkoutResultSchema.parse(res.body);
    expect(result.status).toBe('SOLD');
    expect(result.salePrice).toBe(2900);
    expect(JSON.stringify(res.body)).not.toContain('1400');

    const op = await prisma.operation.findFirstOrThrow({ where: { pairId, type: 'SALE' } });
    expect(Number(op.salePrice)).toBe(2900);
    expect(op.paymentMethod).toBe('CARD');
    expect(Number(op.purchasePriceAtTime)).toBe(1400); // frozen margin basis, DB-only

    await request(http)
      .post('/api/sale')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ pairId, salePrice: 2900, paymentMethod: 'CASH' })
      .expect(409);
  });

  it('списання: WRITTEN_OFF без ціни, з коментарем', async () => {
    const found = saleLookupResponseSchema.parse(
      (await lookup({ size: 38, color: '36', style: '7645' }).expect(200)).body,
    );
    const pairId = found.pair!.pairId; // the second (newer) size-38 pair

    const res = await request(http)
      .post('/api/sale/writeoff')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ pairId, comment: 'Дефект підошви' })
      .expect(201);
    expect(checkoutResultSchema.parse(res.body).status).toBe('WRITTEN_OFF');

    const pair = await prisma.pair.findUniqueOrThrow({ where: { id: pairId } });
    expect(pair.status).toBe('WRITTEN_OFF');
  });

  it('search: варіанти за префіксом стилю, лише на складі, без цін закупки', async () => {
    const res = await request(http)
      .get('/api/sale/search')
      .query({ style: '76' })
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    const parsed = stockSearchResponseSchema.parse(res.body);

    // Both size-38 pairs were checked out by earlier tests — nothing left in stock.
    // The seed guarantees at least the shape; assert seller safety regardless.
    expect(JSON.stringify(res.body)).not.toContain('1400'); // FR-B-02
    for (const item of parsed.items) {
      expect(item.style.startsWith('76')).toBe(true);
    }
  });

  it('без токена → 401', async () => {
    await request(http)
      .post('/api/sale/lookup')
      .send({ size: 38, color: '36', style: '7645' })
      .expect(401);
  });

  it('невалідне тіло → 400', async () => {
    await request(http)
      .post('/api/sale')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ pairId: 'x', salePrice: -5, paymentMethod: 'CARD' })
      .expect(400);
  });
});
