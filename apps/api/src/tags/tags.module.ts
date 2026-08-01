import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.validation';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { GeminiVisionProvider } from './vision/gemini.provider';
import { MockVisionProvider } from './vision/mock.provider';
import { OpenRouterVisionProvider } from './vision/openrouter.provider';
import { UnavailableVisionProvider } from './vision/unavailable.provider';
import { VISION_PROVIDER } from './vision/vision-provider';

@Module({
  controllers: [TagsController],
  providers: [
    TagsService,
    {
      provide: VISION_PROVIDER,
      inject: [ConfigService],
      // VISION_PROVIDER decides; `auto` prefers OpenRouter, falls back to
      // Gemini, and without either key uses the mock outside production
      // (dev/CI keep working) and a hard 503 in production, never a silent
      // mock of real usage. `mock` pins the deterministic provider so
      // recognition flows are testable with a key configured (env validation
      // rejects it in production).
      useFactory: (config: ConfigService<Env, true>) => {
        const geminiKey = config.get('GEMINI_API_KEY', { infer: true });
        const openRouterKey = config.get('OPENROUTER_API_KEY', { infer: true });
        const model = config.get('OPENROUTER_MODEL', { infer: true });
        const choice = config.get('VISION_PROVIDER', { infer: true });

        // Which backend won is otherwise invisible until someone scans a tag
        // and reads the failure — with two keys configured and an `auto` rule
        // between them, "which model answered?" should not be a guess.
        const logger = new Logger('VisionProvider');
        const bind = <T>(provider: T, why: string): T => {
          logger.log(`bound ${why} (VISION_PROVIDER=${choice})`);
          return provider;
        };

        if (choice === 'mock') return bind(new MockVisionProvider(), 'mock');
        if (choice === 'gemini') {
          return bind(new GeminiVisionProvider(geminiKey as string), 'Gemini');
        }
        if (choice === 'openrouter') {
          return bind(
            new OpenRouterVisionProvider(openRouterKey as string, model),
            `OpenRouter (${model ?? 'default model'})`,
          );
        }

        if (openRouterKey) {
          return bind(
            new OpenRouterVisionProvider(openRouterKey, model),
            `OpenRouter (${model ?? 'default model'})`,
          );
        }
        if (geminiKey) return bind(new GeminiVisionProvider(geminiKey), 'Gemini');
        if (config.get('NODE_ENV', { infer: true }) !== 'production') {
          return bind(new MockVisionProvider(), 'mock — no key configured');
        }
        // Production without a key: /tags/recognize answers 503. Warn, because
        // this is a misconfiguration, not a choice.
        logger.warn(`no vision key configured — /tags/recognize will answer 503`);
        return new UnavailableVisionProvider();
      },
    },
  ],
})
export class TagsModule {}
