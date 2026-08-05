import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { APP_VERSION } from './version';

describe('HealthController', () => {
  let controller: HealthController;
  const queryRaw = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: ConfigService, useValue: { get: () => 'demo' } },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('БД відповідає → 200 з database: up', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check()).resolves.toMatchObject({ status: 'ok', database: 'up' });
  });

  // The probe doubles as the deploy receipt the release script polls.
  it('віддає версію релізу і середовище', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const health = await controller.check();

    expect(health.env).toBe('demo');
    expect(health.version).toBe(APP_VERSION);
    // Read from the workspace root package.json, not the api's own.
    expect(health.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('БД недоступна → 503, а не «зелений» health', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
