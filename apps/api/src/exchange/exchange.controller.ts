import { Controller, Get } from '@nestjs/common';
import type { ExchangeRate } from '@madiro/shared';

import { Roles } from '../auth/decorators/roles.decorator';
import { ExchangeService } from './exchange.service';

@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchange: ExchangeService) {}

  /**
   * The rate the price forms preview with. ADMIN only — not because a rate is
   * secret, but because only an admin enters purchase prices, and every
   * endpoint here states its role explicitly (RBAC is fail-closed).
   */
  @Roles('ADMIN')
  @Get('rate')
  rate(): Promise<ExchangeRate> {
    return this.exchange.getRate();
  }
}
