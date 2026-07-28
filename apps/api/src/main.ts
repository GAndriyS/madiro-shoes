import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { Env } from './config/env.validation';
import { CorsIoAdapter } from './realtime/cors-io.adapter';

async function bootstrap(): Promise<void> {
  // bufferLogs holds startup output until the pino logger is attached, so even
  // boot-time failures come out as structured logs.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());

  // Restrict CORS to the known dashboard / scanner origins (comma-separated env).
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });
  // The realtime socket needs the same allowlist, applied at server creation.
  app.useWebSocketAdapter(new CorsIoAdapter(app, origins));

  app.enableShutdownHooks();
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
