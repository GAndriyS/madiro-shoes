import { z } from 'zod';

import { SIZE_MAX, SIZE_MIN } from '../constants.js';

/** Shoe size: an integer within the allowed range. */
export const sizeSchema = z.number().int().min(SIZE_MIN).max(SIZE_MAX);

/** Tag codes (style, color) — handwritten numeric codes stored as text. */
export const tagCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^\d+$/, 'Очікується числовий код з бірки');

/** Money amount in hryvnias: positive, up to two decimal places. */
export const moneySchema = z.number().positive().max(1_000_000).multipleOf(0.01);
