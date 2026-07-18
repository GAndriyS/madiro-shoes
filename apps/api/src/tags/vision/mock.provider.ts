import { Injectable } from '@nestjs/common';

import type { VisionProvider } from './vision-provider';

/**
 * Dev/CI stand-in when no GEMINI_API_KEY is configured: returns the values
 * from the reference fixture (test-assets/test_label.jpg) after a short
 * delay so the frontend's processing state is observable.
 */
@Injectable()
export class MockVisionProvider implements VisionProvider {
  async recognizeTag(): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { size: 38, color: '36', style: '7645', confidence: 0.99 };
  }
}
