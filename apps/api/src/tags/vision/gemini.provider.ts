import { Injectable, Logger } from '@nestjs/common';

import type { VisionImage, VisionProvider } from './vision-provider';
import { VisionProviderError } from './vision-provider';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/** Kept above the frontend's upload timeout budget (45s) with headroom. */
const REQUEST_TIMEOUT_MS = 25_000;

const PROMPT = [
  'You are reading a photo of a shoe-box label from a shoe store.',
  'The label has three small stickers with handwritten digits, labelled',
  'SIZE, COLOR and STYLE (printed headers, order may vary on the box).',
  'Extract the digits from each sticker exactly as written.',
  'SIZE is a European shoe size (a whole number between 16 and 50).',
  'COLOR and STYLE are numeric codes with no fixed length.',
  'Respond with digits only — no units, no extra words.',
  'Set confidence to your overall certainty from 0 to 1; lower it if any',
  'sticker is blurry, cropped or ambiguous.',
].join(' ');

/** Gemini structured-output schema (hand-written; OpenAPI subset, not Zod). */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    size: { type: 'INTEGER' },
    color: { type: 'STRING' },
    style: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
  },
  required: ['size', 'color', 'style', 'confidence'],
} as const;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Gemini 2.5 Flash over plain fetch — one endpoint does not justify an SDK. */
@Injectable()
export class GeminiVisionProvider implements VisionProvider {
  private readonly logger = new Logger(GeminiVisionProvider.name);

  constructor(private readonly apiKey: string) {}

  async recognizeTag(image: VisionImage): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: image.mimeType,
                    data: image.buffer.toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new VisionProviderError('Gemini request failed or timed out', { cause: error });
    }

    if (!response.ok) {
      // Body may contain the key — log status only.
      this.logger.warn(`Gemini responded with HTTP ${response.status}`);
      throw new VisionProviderError(`Gemini responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new VisionProviderError('Gemini returned no candidate text');
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new VisionProviderError('Gemini candidate is not valid JSON', { cause: error });
    }
  }
}
