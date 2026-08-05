import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Public } from '../auth/decorators/public.decorator';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { APP_COMMIT, APP_VERSION } from './version';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
  /** Release version from the workspace root package.json. */
  version: string;
  /** Which deployment this is: development | demo | production. */
  env: Env['APP_ENV'];
  /** Short commit Railway built from; absent outside Railway. */
  commit?: string;
}

/**
 * Liveness/readiness probe for the platform (Railway). A static `{status:'ok'}`
 * reports healthy while Postgres is unreachable and the app can serve nothing
 * but 500s (docs/audit-2026-07, I-3), so the probe actually touches the
 * database and answers 503 when that round trip fails.
 *
 * It doubles as the deploy receipt: `version` and `env` answer "what is
 * actually running in PROD right now?" without opening a dashboard, which is
 * what the release script polls to confirm a release landed.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get()
  async check(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Health check failed: the database is unreachable', error);
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return {
      status: 'ok',
      database: 'up',
      version: APP_VERSION,
      env: this.config.get('APP_ENV', { infer: true }),
      ...(APP_COMMIT ? { commit: APP_COMMIT } : {}),
    };
  }
}
