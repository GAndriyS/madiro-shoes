import { Injectable, Logger } from '@nestjs/common';

import type { VisionImage, VisionProvider } from './vision-provider';
import { VisionProviderError } from './vision-provider';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Kept below the frontend's upload budget (45s) so the server gives up first.
 * 15s rather than the original 25s: the slowest completed call measured across
 * every benchmark run was 8.2s (a fallback model taking over), so this is still
 * ~1.8x headroom, and it halves how long a seller watches a spinner before the
 * failure sheet with its manual-entry escape appears.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Both models read the real box label correctly on every benchmark run — the
 * nano tiers were quicker but flipped digits between runs, and a silently wrong
 * style code writes a pair into the wrong variant, which is worse than slow.
 *
 * They are raced rather than ranked because neither is reliably faster. Sampled
 * in one window, luna had a 488ms median against qwen's 687ms; sampled in
 * another, luna sat at 2339ms while qwen answered in 964ms. OpenRouter's
 * upstream load moves independently per model, so whichever is having a good
 * minute wins and the seller stops paying for the other one's bad one.
 */
const HEDGED_MODELS = ['openai/gpt-5.6-luna', 'qwen/qwen3-vl-32b-instruct'] as const;

const DEFAULT_MODEL = HEDGED_MODELS[0];

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

  /**
   * Races the configured models and takes the first valid answer, aborting the
   * rest. Racing also covers the outage case the old serial `models` fallback
   * handled — a model that 402s or hangs simply loses — without making a
   * healthy scan wait for the sick one to fail first.
   */
  async recognizeTag(image: VisionImage): Promise<unknown> {
    const models = [this.model, ...HEDGED_MODELS.filter((m) => m !== this.model)];
    const controllers = models.map(() => new AbortController());
    // One deadline for the whole race, not one per attempt.
    const deadline = setTimeout(() => {
      for (const controller of controllers) controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const startedAt = Date.now();
    try {
      // Promise.any resolves on the first success and only rejects if every
      // attempt failed, which is exactly the semantics wanted here.
      const winner = await Promise.any(
        models.map((model, index) => this.askModel(model, image, controllers[index]!.signal)),
      );
      this.logger.log(`${winner.model} won in ${Date.now() - startedAt}ms`);
      return winner.parsed;
    } catch (error) {
      const causes = error instanceof AggregateError ? error.errors : [error];
      const detail = causes.map((c) => (c as Error)?.message ?? String(c)).join('; ');
      throw new VisionProviderError(`every OpenRouter model failed: ${detail}`, { cause: error });
    } finally {
      clearTimeout(deadline);
      // Cancel whoever is still in flight — including on the success path, so a
      // loser's socket is released instead of streaming a reply nobody reads.
      for (const controller of controllers) controller.abort();
    }
  }

  private async askModel(
    model: string,
    image: VisionImage,
    signal: AbortSignal,
  ): Promise<{ model: string; parsed: unknown }> {
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
          model,
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
        signal,
      });
    } catch (error) {
      throw new VisionProviderError(`${model}: request failed or timed out`, { cause: error });
    }

    if (!response.ok) {
      // Drain before throwing: an unread body leaves the socket unusable, so
      // undici destroys it instead of returning it to the pool — a burst of
      // 402s or 429s would otherwise make every following scan reconnect.
      await response.text().catch(() => undefined);
      // The body can echo the key — log the status only.
      this.logger.warn(`OpenRouter responded with HTTP ${response.status} for ${model}`);
      throw new VisionProviderError(`${model}: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OpenRouterResponse;
    // A 200 can still carry an error object (upstream provider refused).
    if (payload.error) {
      throw new VisionProviderError(`${model}: ${payload.error.message ?? 'unknown error'}`);
    }
    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new VisionProviderError(`${model}: no message content`);
    }

    try {
      return { model, parsed: JSON.parse(text) as unknown };
    } catch (error) {
      throw new VisionProviderError(`${model}: content is not valid JSON`, { cause: error });
    }
  }
}
