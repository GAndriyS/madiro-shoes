import { Module } from '@nestjs/common';

import { ExchangeModule } from '../exchange/exchange.module';

import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [ExchangeModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
