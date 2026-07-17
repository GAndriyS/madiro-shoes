import { z } from 'zod';

import { sizeSchema, tagCodeSchema } from './common.js';

/**
 * Результат розпізнавання бірки vision-LLM: три рукописні числові наліпки
 * SIZE / COLOR / STYLE + впевненість моделі. Людина завжди підтверджує
 * результат перед збереженням (FR-S-05).
 */
export const tagRecognitionSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  confidence: z.number().min(0).max(1),
});
export type TagRecognition = z.infer<typeof tagRecognitionSchema>;
