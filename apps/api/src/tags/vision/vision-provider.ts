/**
 * Swappable vision backend for tag recognition (FR-B-03): the DI token lets
 * us bind Gemini, a mock, or an "unavailable" stub without touching consumers.
 * Providers return `unknown` — TagsService owns the Zod validation.
 */
export interface VisionImage {
  buffer: Buffer;
  mimeType: string;
}

export interface VisionProvider {
  recognizeTag(image: VisionImage): Promise<unknown>;
}

export const VISION_PROVIDER = Symbol('VISION_PROVIDER');

/** Thrown by providers on transport/model failures; mapped to 502 upstream. */
export class VisionProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VisionProviderError';
  }
}
