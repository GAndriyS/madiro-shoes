import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CLIENT_HEADER,
  REALTIME_EVENT,
  REALTIME_NAMESPACE,
  realtimeEventSchema,
  type RealtimeEvent,
} from '@madiro/shared';
import * as argon2 from 'argon2';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Realtime over a real server and a real socket (FR-B-04 / NFR-03): a seller's
 * scan in the hall must reach the admin dashboard without a reload, and a
 * seller must never be able to listen in (FR-B-02).
 */
describe('Realtime (e2e, real Postgres + socket.io)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  let adminToken: string;
  let sellerToken: string;
  const password = 'realtime-e2e-pass';
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    // A real listening port: socket.io needs an actual server, not supertest's.
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    prisma = app.get(PrismaService);
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        login: 'admin-rt',
        name: 'Admin',
        role: 'ADMIN',
        passwordHash: await argon2.hash(password),
      },
    });
    await prisma.user.create({
      data: {
        login: 'seller-rt',
        name: 'Оля',
        role: 'SELLER',
        passwordHash: await argon2.hash(password),
      },
    });

    const login = async (loginName: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .set(CLIENT_HEADER, 'dashboard')
          .send({ login: loginName, password })
          .expect(200)
      ).body.accessToken as string;
    adminToken = await login('admin-rt');
    sellerToken = await login('seller-rt');
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.close();
    }
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const connect = (token: string): Socket => {
    const socket = io(`${url}${REALTIME_NAMESPACE}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  };

  const once = <T>(socket: Socket, event: string, timeoutMs = 5_000): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Подія ${event} не надійшла`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  it('чернетка продавця миттєво доходить до дашборда адміна', async () => {
    const admin = connect(adminToken);
    await once(admin, 'connect');

    const event = once<RealtimeEvent>(admin, REALTIME_EVENT);
    await request(app.getHttpServer())
      .post('/api/intake')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ size: 38, color: '36', style: '7645' })
      .expect(201);

    expect(realtimeEventSchema.parse(await event).topic).toBe('intake-draft');
  });

  it('продаж і повернення теж оголошуються', async () => {
    const admin = connect(adminToken);
    await once(admin, 'connect');

    const pair = await prisma.pair.findFirstOrThrow({ where: { status: 'IN_STOCK' } });
    const sale = once<RealtimeEvent>(admin, REALTIME_EVENT);
    const sold = await request(app.getHttpServer())
      .post('/api/sale')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ pairId: pair.id, salePrice: 2850, paymentMethod: 'CARD' })
      .expect(201);
    expect((await sale).topic).toBe('sale');

    const saleOp = await prisma.operation.findFirstOrThrow({
      where: { type: 'SALE', pairId: sold.body.pairId as string },
    });
    const back = once<RealtimeEvent>(admin, REALTIME_EVENT);
    await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ operationId: saleOp.id })
      .expect(201);
    expect((await back).topic).toBe('return');
  });

  it('продавця до сокета не пускають (FR-B-02), як і анонімного', async () => {
    const seller = connect(sellerToken);
    await expect(once(seller, 'disconnect')).resolves.toBeDefined();

    const anonymous = connect('');
    await expect(once(anonymous, 'disconnect')).resolves.toBeDefined();
  });
});
