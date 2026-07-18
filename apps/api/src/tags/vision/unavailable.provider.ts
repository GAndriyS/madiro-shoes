import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import type { VisionProvider } from './vision-provider';

/** Bound in production when no vision key is configured: fail loud, not mock. */
@Injectable()
export class UnavailableVisionProvider implements VisionProvider {
  recognizeTag(): Promise<unknown> {
    throw new ServiceUnavailableException('Vision provider is not configured');
  }
}
