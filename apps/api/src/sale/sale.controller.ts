import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  pairLookupSchema,
  saleSchema,
  writeoffSchema,
  type AuthUser,
  type CheckoutResult,
  type SaleLookupResponse,
} from '@madiro/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SaleService } from './sale.service';

@Controller('sale')
@Roles('ADMIN', 'SELLER')
export class SaleController {
  constructor(private readonly sale: SaleService) {}

  // A computation over stock, not a resource creation — hence 200.
  @Post('lookup')
  @HttpCode(200)
  lookup(@Body() body: unknown): Promise<SaleLookupResponse> {
    const parsed = pairLookupSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.sale.lookup(parsed.data);
  }

  @Post()
  sell(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<CheckoutResult> {
    const parsed = saleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.sale.sell(parsed.data, user.id);
  }

  @Post('writeoff')
  writeoff(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<CheckoutResult> {
    const parsed = writeoffSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.sale.writeoff(parsed.data, user.id);
  }
}
