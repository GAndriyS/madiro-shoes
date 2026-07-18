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

  it('rejects unauthenticated and non-admin access to protected routes', async () => {
    await request(http).get('/api/users').expect(401);
    await request(http).get('/api/health').expect(200);
  });
});
