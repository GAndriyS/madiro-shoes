import { join } from 'node:path';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tagRecognitionSchema } from '@madiro/shared';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { VISION_PROVIDER } from '../src/tags/vision/vision-provider';

const FIXTURE = join(__dirname, 'fixtures', 'test_label.jpg');

/**
 * /tags/recognize over the full app against real Postgres. The vision
 * provider is overridden with a deterministic mock so the suite never hits
 * the real Gemini API — even when the local .env carries a key.
 */
describe('Tags (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  const sellerPassword = 'seller-e2e-pass';
  const mockResult = { size: 38, color: '36', style: '7645', confidence: 0.99 };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VISION_PROVIDER)
      .useValue({ recognizeTag: async () => mockResult })
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
    await prisma.user.create({
      data: {
        login: 'seller-tags',
        name: 'Продавець',
        role: 'SELLER',
        passwordHash: await argon2.hash(sellerPassword),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  const login = async () => {
    const res = await request(http)
      .post('/api/auth/login')
      .send({ login: 'seller-tags', password: sellerPassword })
      .expect(200);
    return res.body.accessToken as string;
  };

  it('розпізнає етикетку для авторизованого продавця', async () => {
    const token = await login();

    const res = await request(http)
      .post('/api/tags/recognize')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', FIXTURE)
      .expect(200);

    expect(tagRecognitionSchema.parse(res.body)).toEqual(mockResult);
  });

  it('без токена → 401', async () => {
    // No file attached: the auth guard rejects before multer reads the body,
    // and aborting a half-written multipart stream makes supertest EPIPE.
    await request(http).post('/api/tags/recognize').expect(401);
  });

  it('не-зображення → 400', async () => {
    const token = await login();

    await request(http)
      .post('/api/tags/recognize')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('plain text'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('без файла → 400', async () => {
    const token = await login();

    await request(http)
      .post('/api/tags/recognize')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
