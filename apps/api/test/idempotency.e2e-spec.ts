import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CLIENT_HEADER,
  IDEMPOTENCY_HEADER,
  checkoutResultSchema,
  intakeResultSchema,
} from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * A lost response followed by a retry (spec §5.2), over the full app against
 * real Postgres. Before keys, re-POSTing one intake took the delivery in twice,
 * and a retried sale met a 409 that sent the seller to rescan — and FIFO then
 * sold them the next identical pair. Every case here repeats a request the
 * server has already committed and counts what reached the database.
 */
describe('Idempotency (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  const password = 'seller-e2e-pass';
  const tokens = new Map<string, string>();
  let olia: { id: string };

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
    // Keys go with their user (ON DELETE CASCADE).
    await prisma.user.deleteMany();
    const passwordHash = await argon2.hash(password);
    olia = await prisma.user.create({
      data: { login: 'olia-idem', name: 'Оля', role: 'SELLER', passwordHash },
    });
    await prisma.user.create({
      data: { login: 'iryna-idem', name: 'Ірина', role: 'SELLER', passwordHash },
    });
    for (const login of ['olia-idem', 'iryna-idem']) {
      const res = await request(http)
        .post('/api/auth/login')
        .set(CLIENT_HEADER, 'scanner')
        .send({ login, password })
        .expect(200);
      tokens.set(login, res.body.accessToken as string);
    }
  });

  afterAll(async () => {
    await prisma.operation.deleteMany();
    await prisma.pair.deleteMany();
    await prisma.variant.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const post = (path: string, body: object, key?: string, login = 'olia-idem') => {
    const req = request(http)
      .post(`/api${path}`)
      .set('Authorization', `Bearer ${tokens.get(login)}`);
    return (key ? req.set(IDEMPOTENCY_HEADER, key) : req).send(body);
  };

  /** Two identical pairs of one variant: what FIFO would happily sell twice. */
  const twoIdenticalPairs = async (style: string) => {
    const variant = await prisma.variant.create({
      data: { style, color: '36', material: 'LEATHER', season: 'NONE', purchasePrice: 1400 },
    });
    const older = await prisma.pair.create({
      data: { variantId: variant.id, size: 38, intakeDate: new Date('2026-07-01T12:00:00Z') },
    });
    const newer = await prisma.pair.create({
      data: { variantId: variant.id, size: 38, intakeDate: new Date('2026-07-10T12:00:00Z') },
    });
    return { variant, older, newer };
  };

  describe('POST /intake', () => {
    const delivery = { sizes: [{ size: 38, qty: 10 }], color: '36', style: '1101' };
    const pairsOf = (style: string) => prisma.pair.count({ where: { variant: { style } } });

    it('повтор з тим самим ключем: 10 пар, а не 20, і та сама відповідь', async () => {
      const key = randomUUID();

      const first = await post('/intake', delivery, key).expect(201);
      const again = await post('/intake', delivery, key).expect(201);

      expect(intakeResultSchema.parse(again.body)).toEqual(intakeResultSchema.parse(first.body));
      expect(await pairsOf('1101')).toBe(10);
      expect(
        await prisma.operation.count({
          where: { type: 'INTAKE', pair: { variant: { style: '1101' } } },
        }),
      ).toBe(10);
    });

    it('той самий ключ з іншим тілом → 422 і нічого не записано', async () => {
      const key = randomUUID();
      const body = { ...delivery, style: '1102' };
      await post('/intake', body, key).expect(201);

      const res = await post('/intake', { ...body, sizes: [{ size: 38, qty: 9 }] }, key).expect(
        422,
      );

      expect(res.body.message).toMatch(/Idempotency-Key/);
      expect(await pairsOf('1102')).toBe(10);
    });

    it('ключ належить користувачу: той самий ключ у колеги — окремий прийом', async () => {
      const key = randomUUID();
      const body = { ...delivery, style: '1103', sizes: [{ size: 38, qty: 1 }] };

      await post('/intake', body, key, 'olia-idem').expect(201);
      await post('/intake', body, key, 'iryna-idem').expect(201);

      expect(await pairsOf('1103')).toBe(2);
    });

    // The header is optional: a scanner still cached on a phone during a
    // rollout keeps working exactly as before — unguarded.
    it('без ключа: як і раніше, кожен запит — новий прийом', async () => {
      const body = { ...delivery, style: '1104', sizes: [{ size: 38, qty: 1 }] };

      await post('/intake', body).expect(201);
      await post('/intake', body).expect(201);

      expect(await pairsOf('1104')).toBe(2);
    });

    it('некоректний ключ → 400, а не мовчки без захисту', async () => {
      const body = { ...delivery, style: '1105' };

      await post('/intake', body, 'not-a-uuid').expect(400);

      expect(await pairsOf('1105')).toBe(0);
    });
  });

  describe('POST /sale, /sale/writeoff', () => {
    it('повтор продажу: та сама пара у відповіді, друга ідентична пара лишається на складі', async () => {
      const { older, newer } = await twoIdenticalPairs('2201');
      const key = randomUUID();
      const sale = { pairId: older.id, salePrice: 2850, paymentMethod: 'CASH' };

      const first = await post('/sale', sale, key).expect(201);
      // Before keys this was a 409 — and the rescan that followed sold `newer`.
      const again = await post('/sale', sale, key).expect(201);

      expect(checkoutResultSchema.parse(again.body)).toEqual(
        checkoutResultSchema.parse(first.body),
      );
      expect(await prisma.operation.count({ where: { type: 'SALE', pairId: older.id } })).toBe(1);
      expect((await prisma.pair.findUniqueOrThrow({ where: { id: newer.id } })).status).toBe(
        'IN_STOCK',
      );
    });

    // The phone gave up waiting and retried while the first request was still
    // inside its transaction. The repeat waits on the claimed key and replays —
    // it must not reach the pair lock and lose with a 409 to its own sale.
    it('одночасний повтор: обидва отримують той самий продаж, операція одна', async () => {
      const { older } = await twoIdenticalPairs('2202');
      const key = randomUUID();
      const sale = { pairId: older.id, salePrice: 2850, paymentMethod: 'CARD' };

      const [a, b] = await Promise.all([post('/sale', sale, key), post('/sale', sale, key)]);

      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body).toEqual(a.body);
      expect(await prisma.operation.count({ where: { type: 'SALE', pairId: older.id } })).toBe(1);
    });

    it('ключ продажу на списанні → 422: пара продана, не списана', async () => {
      const { older } = await twoIdenticalPairs('2203');
      const key = randomUUID();
      await post('/sale', { pairId: older.id, salePrice: 2850, paymentMethod: 'CASH' }, key).expect(
        201,
      );

      await post('/sale/writeoff', { pairId: older.id }, key).expect(422);

      expect(await prisma.operation.count({ where: { pairId: older.id } })).toBe(1);
      expect((await prisma.pair.findUniqueOrThrow({ where: { id: older.id } })).status).toBe(
        'SOLD',
      );
    });

    it('повтор списання: одна операція WRITEOFF', async () => {
      const { older } = await twoIdenticalPairs('2204');
      const key = randomUUID();
      const writeoff = { pairId: older.id, comment: 'Брак' };

      await post('/sale/writeoff', writeoff, key).expect(201);
      await post('/sale/writeoff', writeoff, key).expect(201);

      expect(await prisma.operation.count({ where: { type: 'WRITEOFF', pairId: older.id } })).toBe(
        1,
      );
    });

    // A failed request leaves no key behind, so its retry is judged afresh.
    it('продаж, що впав (409), не займає ключ: інший, хто продав пару, — не «повтор»', async () => {
      const { older } = await twoIdenticalPairs('2205');
      await post('/sale', { pairId: older.id, salePrice: 2850, paymentMethod: 'CASH' }).expect(201);
      const key = randomUUID();
      const late = { pairId: older.id, salePrice: 2850, paymentMethod: 'CASH' };

      await post('/sale', late, key, 'iryna-idem').expect(409);
      await post('/sale', late, key, 'iryna-idem').expect(409);

      expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(0);
    });
  });

  describe('POST /returns', () => {
    it('повтор повернення: одна операція RETURN, другий продаж того ж товару не чіпається', async () => {
      const { older, newer } = await twoIdenticalPairs('3301');
      // Two identical pairs sold: the return reverses one, the retry must not
      // go on to reverse the other.
      const saleOf = async (pairId: string, createdAt: string) => {
        await prisma.pair.update({ where: { id: pairId }, data: { status: 'SOLD' } });
        return prisma.operation.create({
          data: {
            type: 'SALE',
            pairId,
            userId: olia.id,
            salePrice: 2850,
            paymentMethod: 'CASH',
            createdAt: new Date(createdAt),
          },
        });
      };
      await saleOf(older.id, '2026-10-01T10:00:00Z');
      const latest = await saleOf(newer.id, '2026-10-02T10:00:00Z');
      const key = randomUUID();

      const first = await post('/returns', { operationId: latest.id }, key).expect(201);
      const again = await post('/returns', { operationId: latest.id }, key).expect(201);

      expect(again.body).toEqual(first.body);
      expect(await prisma.operation.count({ where: { type: 'RETURN' } })).toBe(1);
      expect((await prisma.pair.findUniqueOrThrow({ where: { id: older.id } })).status).toBe(
        'SOLD',
      );
    });
  });
});
