import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { intakeResultSchema } from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Intake persistence over the full app against real Postgres. Focuses on the
 * role branch (FR-B-02): sellers only ever create drafts and never price a
 * pair, admins price or mark "no price".
 */
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

  const token = async (login: string, password: string) => {
    const res = await request(http).post('/api/auth/login').send({ login, password }).expect(200);
    return res.body.accessToken as string;
  };

  it('продавець створює чернетку (awaitingPrice), ціна ігнорується', async () => {
    const seller = await token('seller-intake', sellerPassword);

    const res = await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${seller}`)
      .send({ size: 38, color: '36', style: '7645', purchasePrice: 999 })
      .expect(201);

    const result = intakeResultSchema.parse(res.body);
    expect(result.awaitingPrice).toBe(true);
    expect(result.status).toBe('IN_STOCK');

    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: result.variantId } });
    expect(variant.purchasePrice).toBeNull();
    const op = await prisma.operation.findFirstOrThrow({ where: { pairId: result.pairId } });
    expect(op.type).toBe('INTAKE');
    expect(op.purchasePriceAtTime).toBeNull();
  });

  it('адмін створює пару з ціною: варіант отримує ціну, не чекає', async () => {
    const admin = await token('admin', adminPassword);

    const res = await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${admin}`)
      .send({ size: 40, color: '36', style: '7645', purchasePrice: 1400 })
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
      .send({ size: 41, color: '36', style: '7645', purchasePrice: 1400 })
      .expect(201);

    const after = await prisma.variant.count({ where: { style: '7645', color: '36' } });
    expect(after).toBe(before);
  });

  it('без токена → 401', async () => {
    await request(http)
      .post('/api/intake')
      .send({ size: 38, color: '36', style: '7645' })
      .expect(401);
  });

  it('невалідне тіло (розмір поза діапазоном) → 400', async () => {
    const seller = await token('seller-intake', sellerPassword);

    await request(http)
      .post('/api/intake')
      .set('Authorization', `Bearer ${seller}`)
      .send({ size: 99, color: '36', style: '7645' })
      .expect(400);
  });
});
