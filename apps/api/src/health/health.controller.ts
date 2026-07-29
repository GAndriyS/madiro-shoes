import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
}

/**
 * Liveness/readiness probe for the platform (Railway). A static `{status:'ok'}`
 * reports healthy while Postgres is unreachable and the app can serve nothing
 * but 500s (docs/audit-2026-07, I-3), so the probe actually touches the
 * database and answers 503 when that round trip fails.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Health check failed: the database is unreachable', error);
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok', database: 'up' };
  }
}
