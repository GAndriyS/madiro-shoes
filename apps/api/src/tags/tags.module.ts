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
      // Key present → Gemini. Absent: mock outside production (dev/CI keep
      // working), hard 503 in production — never silently mock real usage.
      useFactory: (config: ConfigService<Env, true>) => {
        const key = config.get('GEMINI_API_KEY', { infer: true });
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
