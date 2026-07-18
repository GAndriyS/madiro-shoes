import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integration test against a real Postgres (CI provides the service).
 * Exercises the auth + users flow end to end so Prisma queries, the unique
 * login constraint (409), soft delete and the fail-closed role guard are all
 * covered against the actual database — the cheap guard against expensive bugs.
 */
describe('API (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  const adminPassword = 'admin-e2e-pass';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    http = app.getHttpServer() as Server;

    // Clean slate + a fresh admin (respecting FK order).
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
  });

  afterAll(async () => {
    // FK-safe order: the summary test leaves operations/pairs referencing users.
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const login = (loginName: string, password: string) =>
    request(http).post('/api/auth/login').send({ login: loginName, password });

  it('runs the full seller lifecycle with role scoping and unique-login enforcement', async () => {
    const adminRes = await login('admin', adminPassword).expect(200);
    const adminToken = adminRes.body.accessToken as string;
    expect(adminRes.body.user.role).toBe('ADMIN');

    // Admin creates a seller
    const created = await request(http)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Оля', login: 'olia-e2e', password: 'seller-pass' })
      .expect(201);
    const sellerId = created.body.id as string;
    expect(sellerId).toBeTruthy();

    // The new seller can log in and is a SELLER
    const sellerRes = await login('olia-e2e', 'seller-pass').expect(200);
    const sellerToken = sellerRes.body.accessToken as string;
    expect(sellerRes.body.user.role).toBe('SELLER');

    // Fail-closed roles: seller is denied on the admin-only list, allowed on its own profile
    await request(http).get('/api/users').set('Authorization', `Bearer ${sellerToken}`).expect(403);
    await request(http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    // Duplicate login is rejected with 409, not a 500
    await request(http)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Інша', login: 'olia-e2e', password: 'another-pass' })
      .expect(409);

    // Soft delete removes access but keeps the row
    await request(http)
      .delete(`/api/users/${sellerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await login('olia-e2e', 'seller-pass').expect(401);

    const deleted = await prisma.user.findUnique({ where: { id: sellerId } });
    expect(deleted?.deletedAt).not.toBeNull();
  });

  it('revokes a seller session when the admin changes their password (tokenVersion)', async () => {
    const adminToken = (await login('admin', adminPassword).expect(200)).body.accessToken as string;

    const created = await request(http)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Петро', login: 'petro-e2e', password: 'petro-pass' })
      .expect(201);
    const sellerId = created.body.id as string;

    const oldToken = (await login('petro-e2e', 'petro-pass').expect(200)).body
      .accessToken as string;
    await request(http).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`).expect(200);

    // Admin resets the password → the previously issued (unexpired) token is now rejected.
    await request(http)
      .patch(`/api/users/${sellerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Петро', login: 'petro-e2e', password: 'petro-new-pass' })
      .expect(200);

    await request(http).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`).expect(401);
    await login('petro-e2e', 'petro-pass').expect(401);
    await login('petro-e2e', 'petro-new-pass').expect(200);
  });

  it('serves the scanner home summary for any authenticated staff member', async () => {
    const adminToken = (await login('admin', adminPassword).expect(200)).body.accessToken as string;

    const created = await request(http)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Соломія', login: 'solomia-e2e', password: 'solomia-pass' })
      .expect(201);
    const sellerId = created.body.id as string;
    const sellerToken = (await login('solomia-e2e', 'solomia-pass').expect(200)).body
      .accessToken as string;

    // Fresh seller: zeros everywhere
    const empty = await request(http)
      .get('/api/me/summary')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    expect(empty.body).toEqual({ todaySalesPairs: 0, todaySalesTotal: 0, draftsInQueue: 0 });

    // A draft pair and a sale operation make the summary move
    const variant = await prisma.variant.create({
      data: { style: '7777', color: '11', material: 'LEATHER', season: 'NONE' },
    });
    const pair = await prisma.pair.create({
      data: { variantId: variant.id, size: 38, awaitingPrice: true, createdById: sellerId },
    });
    await prisma.operation.create({
      data: { type: 'SALE', pairId: pair.id, userId: sellerId, salePrice: 2850 },
    });

    const filled = await request(http)
      .get('/api/me/summary')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    expect(filled.body).toEqual({ todaySalesPairs: 1, todaySalesTotal: 2850, draftsInQueue: 1 });
  });

  it('rejects unauthenticated and non-admin access to protected routes', async () => {
    await request(http).get('/api/users').expect(401);
    await request(http).get('/api/health').expect(200);
  });
});
