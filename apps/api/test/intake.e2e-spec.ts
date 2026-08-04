import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLIENT_HEADER, intakeResultSchema } from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Intake persistence over the full app against real Postgres. Focuses on the
 * role branch (FR-B-02): sellers only ever create drafts and never price a
 * pair, admins price or mark "no price".
 */
/** Pinned for the whole suite in test/setup-e2e.ts. */
const RATE = 40;

describe('Intake (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  const adminPassword = 'admin-e2e-pass';
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
    await prisma.user.create({
      data: {
        login: 'admin',
        name: 'Admin',
        role: 'ADMIN',
        passwordHash: await argon2.hash(adminPassword),
      },
    });
    await prisma.user.create({
      data: {
        login: 'seller-intake',
        name: 'Продавець',
        role: 'SELLER',
        passwordHash: await argon2.hash(sellerPassword),
      },
    });
  });

  afterAll(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  // Cached per login: this suite is about intake, not about logging in, and a
  // fresh login per test walks straight into the endpoint's own rate limit
  // (LOGIN_LIMIT per minute) once the suite grows past a dozen cases.
  const tokens = new Map<string, string>();
  const token = async (login: string, password: string) => {
    const cached = tokens.get(login);
    if (cached) return cached;

    const res = await request(http)
      .post('/api/auth/login')
      .set(CLIENT_HEADER, 'scanner')
      .send({ login, password })
      .expect(200);
    const accessToken = res.body.accessToken as string;
    tokens.set(login, accessToken);
    return accessToken;
  };

  it('продавець створює чернетку (awaitingPrice), ціна ігнорується', async () => {
    const seller = await token('seller-intake', sellerPassword);

    const res = await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${seller}`)
      .send({ sizes: [{ size: 38, qty: 1 }], color: '36', style: '7645', purchasePriceUsd: 999 })
      .expect(201);

    const result = intakeResultSchema.parse(res.body);
    expect(result.awaitingPrice).toBe(true);
    expect(result.status).toBe('IN_STOCK');

    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: result.variantId } });
    expect(variant.purchasePrice).toBeNull();
    const op = await prisma.operation.findFirstOrThrow({
      where: { pairId: result.pairs[0]!.pairId },
    });
    expect(op.type).toBe('INTAKE');
    expect(op.purchasePriceAtTime).toBeNull();
  });

  it('адмін створює пару з ціною: варіант отримує ціну, не чекає', async () => {
    const admin = await token('admin', adminPassword);

    const res = await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${admin}`)
      .send({ sizes: [{ size: 40, qty: 1 }], color: '36', style: '7645', purchasePriceUsd: 35 })
      .expect(201);

    const result = intakeResultSchema.parse(res.body);
    expect(result.awaitingPrice).toBe(false);
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: result.variantId } });
    expect(Number(variant.purchasePrice)).toBe(1400);
  });

  it('той самий варіант (5 полів) перевикористовується, а не дублюється', async () => {
    const admin = await token('admin', adminPassword);
    const before = await prisma.variant.count({ where: { style: '7645', color: '36' } });

    await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${admin}`)
      .send({ sizes: [{ size: 41, qty: 1 }], color: '36', style: '7645', purchasePriceUsd: 35 })
      .expect(201);

    const after = await prisma.variant.count({ where: { style: '7645', color: '36' } });
    expect(after).toBe(before);
  });

  it('одночасне поступлення того самого варіанта без матеріалу/утеплення не дублює його', async () => {
    const seller = await token('seller-intake', sellerPassword);
    const body = { sizes: [{ size: 39, qty: 1 }], color: '77', style: '9001' }; // material/season = null

    // Postgres treats NULLs as distinct, so @@unique alone lets both inserts
    // through (docs/audit-2026-07, M-2) — the advisory lock in
    // findOrCreateVariant is what keeps this at a single variant.
    const results = await Promise.all([
      request(http).post('/api/intake').set('Authorization', `Bearer ${seller}`).send(body),
      request(http).post('/api/intake').set('Authorization', `Bearer ${seller}`).send(body),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);

    const variants = await prisma.variant.findMany({ where: { style: '9001', color: '77' } });
    expect(variants).toHaveLength(1);
    // Both pairs landed on that one variant.
    await expect(prisma.pair.count({ where: { variantId: variants[0]!.id } })).resolves.toBe(2);
  });

  it('без токена → 401', async () => {
    await request(http)
      .post('/api/intake')
      .send({ sizes: [{ size: 38, qty: 1 }], color: '36', style: '7645' })
      .expect(401);
  });

  it('невалідне тіло (розмір поза діапазоном) → 400', async () => {
    const seller = await token('seller-intake', sellerPassword);

    await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${seller}`)
      .send({ sizes: [{ size: 99, qty: 1 }], color: '36', style: '7645' })
      .expect(400);
  });

  // The whole reason the endpoint takes quantities: one scan receives the run
  // of sizes that arrived, not the single size the box label showed.
  it('батч: кількості дають по парі на одиницю в межах одного варіанта', async () => {
    const admin = await token('admin', adminPassword);

    const res = await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        sizes: [
          { size: 36, qty: 2 },
          { size: 37, qty: 1 },
        ],
        color: '55',
        style: '8100',
        purchasePriceUsd: 30,
      })
      .expect(201);

    const result = intakeResultSchema.parse(res.body);
    expect(result.pairs.map((p) => p.size)).toEqual([36, 36, 37]);

    // One variant, three pairs — a quantity is rows, never a counter column.
    const pairs = await prisma.pair.findMany({ where: { variantId: result.variantId } });
    expect(pairs).toHaveLength(3);
    const ops = await prisma.operation.findMany({
      where: { type: 'INTAKE', pairId: { in: result.pairs.map((p) => p.pairId) } },
      select: { purchasePriceAtTime: true },
    });
    expect(ops).toHaveLength(3);

    // The price is per pair, not per delivery: one conversion of $30 is frozen
    // into every pair's basis, so margin works whichever pair gets sold.
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: result.variantId } });
    expect(Number(variant.purchasePrice)).toBe(30 * RATE);
    expect(ops.map((op) => Number(op.purchasePriceAtTime))).toEqual([
      30 * RATE,
      30 * RATE,
      30 * RATE,
    ]);
  });

  it('порожній список розмірів → 400', async () => {
    const seller = await token('seller-intake', sellerPassword);

    await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${seller}`)
      .send({ sizes: [], color: '36', style: '7645' })
      .expect(400);
  });

  // Summing a repeated size would take in pairs nobody asked for; that is a
  // client bug, and the server says so instead of guessing.
  it('повторений розмір у тілі → 400', async () => {
    const seller = await token('seller-intake', sellerPassword);

    await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${seller}`)
      .send({
        sizes: [
          { size: 38, qty: 1 },
          { size: 38, qty: 2 },
        ],
        color: '36',
        style: '7645',
      })
      .expect(400);
  });

  describe('підказка ціни закупки (FR-D-08)', () => {
    it('віддає ціну варіанта, ідентичність — та сама, що при поступленні', async () => {
      const admin = await token('admin', adminPassword);

      await request(http)
        .post('/api/intake')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          sizes: [{ size: 41, qty: 1 }],
          color: '12',
          style: '4400',
          material: 'SUEDE',
          season: 'BAIKA',
          purchasePriceUsd: 1750 / RATE,
        })
        .expect(201);

      const res = await request(http)
        .get('/api/intake/price-hint')
        .query({ style: '4400', color: '12', material: 'SUEDE', season: 'BAIKA' })
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(res.body).toEqual({ purchasePriceUsd: 1750 / RATE });
    });

    // The intake form may omit insulation; the hint must still find the variant
    // the save would land in, or the suggestion silently disappears.
    it('пропущене утеплення знаходить той самий варіант, що й NONE', async () => {
      const admin = await token('admin', adminPassword);

      await request(http)
        .post('/api/intake')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          sizes: [{ size: 40, qty: 1 }],
          color: '13',
          style: '4401',
          purchasePriceUsd: 990 / RATE,
        })
        .expect(201);

      const res = await request(http)
        .get('/api/intake/price-hint')
        .query({ style: '4401', color: '13' })
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(res.body).toEqual({ purchasePriceUsd: 990 / RATE });
    });

    it('невідомий варіант → підказки немає', async () => {
      const admin = await token('admin', adminPassword);

      const res = await request(http)
        .get('/api/intake/price-hint')
        .query({ style: '0000', color: '99' })
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(res.body).toEqual({ purchasePriceUsd: null });
    });

    // FR-B-02: this endpoint returns a purchase price, so a seller must not reach it.
    it('продавцю закрито — 403, ціна закупки не витікає', async () => {
      const seller = await token('seller-intake', sellerPassword);

      await request(http)
        .get('/api/intake/price-hint')
        .query({ style: '4400', color: '12' })
        .set('Authorization', `Bearer ${seller}`)
        .expect(403);
    });
  });
});
