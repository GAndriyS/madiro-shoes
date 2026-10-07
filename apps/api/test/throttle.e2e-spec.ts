import { join } from 'node:path';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLIENT_HEADER, refreshCookieName } from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service';

const FIXTURE = join(__dirname, 'fixtures', 'test_label.jpg');

/**
 * Rate limits are keyed by identity, not by IP: behind the Caddy proxy every
 * request in production shares one address, so an IP-keyed limit would cap
 * the whole shop together. Each case below sends everything from the same
 * socket — the only thing that differs is who is asking.
 *
 * The login/refresh limits are read from the environment when the controller
 * module loads, so they are set here before AppModule is imported — which is
 * why the imports below are dynamic and the test runs in its own file.
 */
describe('Rate limiting (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaServiceType;
  let http: Server;
  const password = 'throttle-e2e-pass';

  beforeAll(async () => {
    process.env.AUTH_LOGIN_RATE_LIMIT = '2';
    process.env.AUTH_REFRESH_RATE_LIMIT = '2';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const { VISION_PROVIDER } = await import('../src/tags/vision/vision-provider');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VISION_PROVIDER)
      .useValue({
        recognizeTag: async () => ({ size: 38, color: '36', style: '7645', confidence: 0.99 }),
      })
      .compile();
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
    // Two pairs of accounts: the login-limit case burns its accounts' budget
    // (every attempt counts, successful or not), so the other cases use
    // their own.
    await prisma.user.createMany({
      data: [
        { login: 'olia-th', name: 'Оля', role: 'SELLER', passwordHash },
        { login: 'iryna-th', name: 'Ірина', role: 'SELLER', passwordHash },
        { login: 'brute-a', name: 'A', role: 'SELLER', passwordHash },
        { login: 'brute-b', name: 'B', role: 'SELLER', passwordHash },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  const login = (loginName: string, pass = password) =>
    request(http)
      .post('/api/auth/login')
      .set(CLIENT_HEADER, 'scanner')
      .send({ login: loginName, password: pass });

  it('невдалі логіни лімітуються на акаунт: сусідній акаунт не страждає', async () => {
    await login('brute-a', 'wrong').expect(401);
    await login('brute-a', 'wrong').expect(401);
    await login('brute-a', 'wrong').expect(429);
    // Same IP, same second, a different account: not throttled.
    await login('brute-b', 'wrong').expect(401);
    // Case and whitespace do not open a fresh bucket for the same account.
    await login('  BRUTE-A ', 'wrong').expect(429);
  });

  it('розпізнавання лімітується на продавця, не на магазин', async () => {
    // First login of two per account in this file (the limit is 2).
    const olia = (await login('olia-th').expect(200)).body.accessToken as string;
    const iryna = (await login('iryna-th').expect(200)).body.accessToken as string;
    const recognize = (token: string) =>
      request(http)
        .post('/api/tags/recognize')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', FIXTURE);

    // The recognition limit is a fixed 10/min (tags.controller.ts).
    for (let i = 0; i < 10; i += 1) {
      await recognize(olia).expect(200);
    }
    // The 11th is refused by the guard before the multipart body is read, and
    // the server closes the socket while supertest is still streaming the
    // photo (EPIPE). Send no body: the verdict is the same, minus the race.
    await request(http)
      .post('/api/tags/recognize')
      .set('Authorization', `Bearer ${olia}`)
      .expect(429);
    // A colleague at the same counter, through the same proxy, still scans.
    await recognize(iryna).expect(200);
  });

  it('refresh лімітується на сесію: друга сесія не ділить кошик', async () => {
    // Each login is a distinct session with its own refresh cookie. The login
    // limit is 2 per account and both accounts used one above, so take one
    // more from each rather than two from one.
    const cookieOf = (res: request.Response) =>
      (res.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith(`${refreshCookieName('scanner')}=`))!
        .split(';')[0]!;
    const sessionA = cookieOf(await login('olia-th').expect(200));
    const sessionB = cookieOf(await login('iryna-th').expect(200));
    const refresh = (cookie: string) =>
      request(http).post('/api/auth/refresh').set(CLIENT_HEADER, 'scanner').set('Cookie', cookie);

    await refresh(sessionA).expect(200);
    await refresh(sessionA).expect(200);
    await refresh(sessionA).expect(429);
    await refresh(sessionB).expect(200);
  });
});
