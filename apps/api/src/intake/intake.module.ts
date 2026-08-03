import { Module } from '@nestjs/common';

import { ExchangeModule } from '../exchange/exchange.module';

import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';

@Module({
  imports: [ExchangeModule],
  controllers: [IntakeController],
  providers: [IntakeService],
})
export class IntakeModule {}
