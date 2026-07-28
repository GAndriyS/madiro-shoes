import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import type { Env } from './config/env.validation';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { pinoOptions } from './logging/logging.config';
import { IntakeModule } from './intake/intake.module';
import { MeModule } from './me/me.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReturnsModule } from './returns/returns.module';
import { SaleModule } from './sale/sale.module';
import { StatsModule } from './stats/stats.module';
import { StockModule } from './stock/stock.module';
import { TagsModule } from './tags/tags.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        pinoOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    // Generous global rate limit (one store, one admin); login/refresh tighten
    // it via @Throttle. In-memory store — swap for Redis if the API ever scales out.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    MeModule,
    TagsModule,
    IntakeModule,
    SaleModule,
    ReturnsModule,
    StockModule,
    StatsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
