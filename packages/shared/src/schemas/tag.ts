import { z } from 'zod';

import { sizeSchema, tagCodeSchema } from './common.js';

/**
 * Vision-LLM tag recognition result: the three handwritten numeric stickers
 * SIZE / COLOR / STYLE plus the model's confidence. A human always confirms
 * the result before saving (FR-S-05).
 */
export const tagRecognitionSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  confidence: z.number().min(0).max(1),
});
export type TagRecognition = z.infer<typeof tagRecognitionSchema>;
