import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.validation';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { GeminiVisionProvider } from './vision/gemini.provider';
import { MockVisionProvider } from './vision/mock.provider';
import { UnavailableVisionProvider } from './vision/unavailable.provider';
import { VISION_PROVIDER } from './vision/vision-provider';

@Module({
  controllers: [TagsController],
  providers: [
    TagsService,
    {
      provide: VISION_PROVIDER,
      inject: [ConfigService],
      // VISION_PROVIDER decides; `auto` keeps the original rule — key present
      // → Gemini, absent → mock outside production (dev/CI keep working) and a
      // hard 503 in production, never a silent mock of real usage. `mock`
      // pins the deterministic provider so recognition flows are testable
      // with a key configured (env validation rejects it in production).
      useFactory: (config: ConfigService<Env, true>) => {
        const key = config.get('GEMINI_API_KEY', { infer: true });
        const choice = config.get('VISION_PROVIDER', { infer: true });

        if (choice === 'mock') return new MockVisionProvider();
        if (choice === 'gemini') return new GeminiVisionProvider(key as string);

        if (key && key.length > 0) return new GeminiVisionProvider(key);
        if (config.get('NODE_ENV', { infer: true }) !== 'production') {
          return new MockVisionProvider();
        }
        return new UnavailableVisionProvider();
      },
    },
  ],
})
export class TagsModule {}
