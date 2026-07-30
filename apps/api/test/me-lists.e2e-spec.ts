import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CLIENT_HEADER,
  myDraftSchema,
  myDraftsResponseSchema,
  mySalesResponseSchema,
} from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Seller personal lists (FR-S-13/17): own sales for the period, own drafts,
 * and draft edit/delete with ownership guards — against real Postgres.
 */
describe('My sales & drafts (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  let oliaToken: string;
  let oliaId: string;
  let irynaId: string;
  const password = 'seller-e2e-pass';

  const login = async (loginName: string) => {
    const res = await request(http)
      .post('/api/auth/login')
      .set(CLIENT_HEADER, 'scanner')
      .send({ login: loginName, password })
      .expect(200);
    return res.body.accessToken as string;
  };

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
    const olia = await prisma.user.create({
      data: { login: 'olia-e2e', name: 'Оля', role: 'SELLER', passwordHash },
    });
    const iryna = await prisma.user.create({
      data: { login: 'iryna-e2e', name: 'Ірина', role: 'SELLER', passwordHash },
    });
    oliaId = olia.id;
    irynaId = iryna.id;

    const variant = await prisma.variant.create({
      data: { style: '7645', color: '36', material: 'LEATHER', season: 'SHEEPSKIN' },
    });
    // Olia: one sold pair (today) + one draft; Iryna: one sale of her own.
    const soldPair = await prisma.pair.create({
      data: { variantId: variant.id, size: 38, status: 'SOLD', createdById: olia.id },
    });
    await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: soldPair.id,
        userId: olia.id,
        salePrice: 2850,
        paymentMethod: 'CARD',
      },
    });
    const irynaPair = await prisma.pair.create({
      data: { variantId: variant.id, size: 40, status: 'SOLD', createdById: iryna.id },
    });
    await prisma.operation.create({
      data: {
        type: 'SALE',
        pairId: irynaPair.id,
        userId: iryna.id,
        salePrice: 1000,
        paymentMethod: 'CASH',
      },
    });
    await prisma.pair.create({
      data: { variantId: variant.id, size: 37, awaitingPrice: true, createdById: olia.id },
    });
    // Olia also wrote a pair off (S-5): visible in her list, absent from totals.
    const writtenOffPair = await prisma.pair.create({
      data: { variantId: variant.id, size: 39, status: 'WRITTEN_OFF', createdById: olia.id },
    });
    await prisma.operation.create({
      data: { type: 'WRITEOFF', pairId: writtenOffPair.id, userId: olia.id, comment: 'дефект' },
    });

    oliaToken = await login('olia-e2e');
  });

  afterAll(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  it('/me/sales: лише власні продажі, підсумок і рядки за сьогодні', async () => {
    const res = await request(http)
      .get('/api/me/sales')
      .query({ period: 'today' })
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(200);
    const parsed = mySalesResponseSchema.parse(res.body);

    // The write-off shows as a row but never counts: totals stay 1 pair / 2850.
    expect(parsed.pairs).toBe(1);
    expect(parsed.total).toBe(2850);
    expect(parsed.items).toHaveLength(2); // Olia's sale + write-off; Iryna's sale is not visible
    expect(parsed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SALE',
          style: '7645',
          color: '36',
          size: 38,
          paymentMethod: 'CARD',
          amount: 2850,
        }),
        expect.objectContaining({
          type: 'WRITEOFF',
          size: 39,
          paymentMethod: null,
          amount: null,
        }),
      ]),
    );
  });

  it('/me/sales: period=month теж повертає продаж', async () => {
    const res = await request(http)
      .get('/api/me/sales')
      .query({ period: 'month' })
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(200);
    expect(mySalesResponseSchema.parse(res.body).items).toHaveLength(2);
  });

  it('/me/sales: явний поточний місяць бачить той самий продаж', async () => {
    // The seeded sale happened "now", so the store's current month must contain it.
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .slice(0, 7);

    const res = await request(http)
      .get('/api/me/sales')
      .query({ period: 'month', month })
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(200);
    expect(mySalesResponseSchema.parse(res.body).items).toHaveLength(2);
  });

  // The bounded range is the whole point: an old month must not sweep in later sales.
  it('/me/sales: минулий місяць порожній, а не «все від тієї дати»', async () => {
    const res = await request(http)
      .get('/api/me/sales')
      .query({ period: 'month', month: '2020-01' })
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(200);

    const parsed = mySalesResponseSchema.parse(res.body);
    expect(parsed.items).toHaveLength(0);
    expect(parsed.pairs).toBe(0);
    expect(parsed.total).toBe(0);
  });

  it('/me/sales: некоректний формат місяця → 400', async () => {
    await request(http)
      .get('/api/me/sales')
      .query({ period: 'month', month: '2026-13' })
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(400);
  });

  it('/me/drafts: власні пари на складі зі статусом awaitingPrice', async () => {
    const res = await request(http)
      .get('/api/me/drafts')
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(200);
    const parsed = myDraftsResponseSchema.parse(res.body);

    expect(parsed.items).toHaveLength(1); // sold pair excluded, only in-stock
    expect(parsed.items[0]).toMatchObject({ size: 37, awaitingPrice: true });
  });

  it('PATCH чернетки: зміна полів перекидає пару на інший варіант', async () => {
    const drafts = myDraftsResponseSchema.parse(
      (await request(http).get('/api/me/drafts').set('Authorization', `Bearer ${oliaToken}`)).body,
    );
    const pairId = drafts.items[0]!.pairId;

    const res = await request(http)
      .patch(`/api/intake/${pairId}`)
      .set('Authorization', `Bearer ${oliaToken}`)
      .send({ size: 39, color: '44', style: '5211', material: 'SUEDE', season: 'BAIKA' })
      .expect(200);
    const updated = myDraftSchema.parse(res.body);
    expect(updated).toMatchObject({
      size: 39,
      color: '44',
      style: '5211',
      material: 'SUEDE',
      season: 'BAIKA',
      awaitingPrice: true,
    });

    const pair = await prisma.pair.findUniqueOrThrow({
      where: { id: pairId },
      include: { variant: true },
    });
    expect(pair.variant.style).toBe('5211');
  });

  it('чужу чернетку не можна редагувати чи видалити (404)', async () => {
    const variant = await prisma.variant.findFirstOrThrow();
    const irynaDraft = await prisma.pair.create({
      data: { variantId: variant.id, size: 41, awaitingPrice: true, createdById: irynaId },
    });

    await request(http)
      .patch(`/api/intake/${irynaDraft.id}`)
      .set('Authorization', `Bearer ${oliaToken}`)
      .send({ size: 42, color: '36', style: '7645' })
      .expect(404);
    await request(http)
      .delete(`/api/intake/${irynaDraft.id}`)
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(404);
  });

  it('DELETE чернетки: операція і пара зникають; підтверджену пару видалити не можна', async () => {
    const drafts = myDraftsResponseSchema.parse(
      (await request(http).get('/api/me/drafts').set('Authorization', `Bearer ${oliaToken}`)).body,
    );
    const pairId = drafts.items.find((d) => d.awaitingPrice)!.pairId;

    await request(http)
      .delete(`/api/intake/${pairId}`)
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(200);
    expect(await prisma.pair.findUnique({ where: { id: pairId } })).toBeNull();
    expect(await prisma.operation.findFirst({ where: { pairId } })).toBeNull();

    // A confirmed (non-awaiting) pair is not deletable through this endpoint.
    const variant = await prisma.variant.findFirstOrThrow();
    const confirmed = await prisma.pair.create({
      data: { variantId: variant.id, size: 44, awaitingPrice: false, createdById: oliaId },
    });
    await request(http)
      .delete(`/api/intake/${confirmed.id}`)
      .set('Authorization', `Bearer ${oliaToken}`)
      .expect(404);
  });

  it('без токена → 401', async () => {
    await request(http).get('/api/me/sales').expect(401);
    await request(http).get('/api/me/drafts').expect(401);
  });
});
