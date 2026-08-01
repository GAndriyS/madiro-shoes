import { Injectable, Logger } from '@nestjs/common';

import type { VisionImage, VisionProvider } from './vision-provider';
import { VisionProviderError } from './vision-provider';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Kept below the frontend's upload budget (45s) so the server gives up first. */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Default model, chosen by benchmarking candidates against a real box label:
 * it read the tag correctly on every run at a ~490ms median, the fastest of
 * the models that never misread a digit. The nano tiers were quicker still but
 * flipped digits between runs — a silently wrong style code is worse than a
 * slow one, since it writes a pair into the wrong variant.
 */
const DEFAULT_MODEL = 'openai/gpt-5.6-luna';

/**
 * Tried in order when the primary is unavailable; OpenRouter fails over on its
 * own. Both were also correct on every benchmark run, so a fallback degrades
 * latency rather than accuracy.
 */
const FALLBACK_MODELS = ['qwen/qwen3-vl-32b-instruct', 'google/gemini-3.5-flash-lite'];

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
  // Boxes are stacked on the shelf, so neighbouring labels creep into frame.
  // The scanner crops to its viewfinder; this covers gallery photos, which
  // are sent whole.
  'If several labels are visible, read ONLY the label closest to the centre',
  'of the image and ignore every other label.',
].join(' ');

/** JSON Schema for structured output — the OpenAI-compatible `json_schema` shape. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    size: { type: 'integer' },
    color: { type: 'string' },
    style: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['size', 'color', 'style', 'confidence'],
  additionalProperties: false,
} as const;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  error?: { message?: string };
}

/**
 * OpenRouter over plain fetch — one endpoint does not justify an SDK. The API
 * is OpenAI-compatible, so the image travels as a base64 data URL in an
 * `image_url` part and the contract is pinned by `response_format`.
 */
@Injectable()
export class OpenRouterVisionProvider implements VisionProvider {
  private readonly logger = new Logger(OpenRouterVisionProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async recognizeTag(image: VisionImage): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // Optional attribution headers OpenRouter uses for its dashboards.
          'HTTP-Referer': 'https://github.com/GAndriyS/madiro-shoes',
          'X-Title': 'Madiro',
        },
        body: JSON.stringify({
          model: this.model,
          // OpenRouter routes to the next entry when one is down, so a provider
          // outage degrades latency instead of failing the scan.
          models: [this.model, ...FALLBACK_MODELS.filter((m) => m !== this.model)],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
                  },
                },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'tag_recognition', strict: true, schema: RESPONSE_SCHEMA },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new VisionProviderError('OpenRouter request failed or timed out', { cause: error });
    }

    if (!response.ok) {
      // The body can echo the key — log the status only.
      this.logger.warn(`OpenRouter responded with HTTP ${response.status}`);
      throw new VisionProviderError(`OpenRouter responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OpenRouterResponse;
    // A 200 can still carry an error object (upstream provider refused).
    if (payload.error) {
      throw new VisionProviderError(`OpenRouter error: ${payload.error.message ?? 'unknown'}`);
    }
    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new VisionProviderError('OpenRouter returned no message content');
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new VisionProviderError('OpenRouter content is not valid JSON', { cause: error });
    }
  }
}
