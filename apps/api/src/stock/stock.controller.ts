import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  setVariantPriceSchema,
  stockListQuerySchema,
  type StockListResponse,
  type VariantDetail,
} from '@madiro/shared';

import { Roles } from '../auth/decorators/roles.decorator';
import { StockService } from './stock.service';

// Admin-only: purchase prices and margins never reach sellers (FR-B-02).
@Controller('stock')
@Roles('ADMIN')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('variants')
  list(@Query() query: Record<string, string>): Promise<StockListResponse> {
    const parsed = stockListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.stock.list(parsed.data);
  }

  @Get('variants/:id')
  detail(@Param('id') id: string): Promise<VariantDetail> {
    return this.stock.detail(id);
  }

  @Patch('variants/:id/price')
  setPrice(@Param('id') id: string, @Body() body: unknown): Promise<{ ok: true }> {
    const parsed = setVariantPriceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.stock.setPrice(id, parsed.data.purchasePrice);
  }

  @Post('variants/:id/no-price')
  setNoPrice(@Param('id') id: string): Promise<{ ok: true }> {
    return this.stock.setNoPrice(id);
  }

  @Delete('pairs/:id')
  deletePair(@Param('id') id: string): Promise<{ ok: true }> {
    return this.stock.deletePair(id);
  }
}
