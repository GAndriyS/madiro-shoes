import { z } from 'zod';

import { SIZE_MAX, SIZE_MIN } from '../constants.js';

/** Розмір взуття: ціле число в допустимому діапазоні. */
export const sizeSchema = z.number().int().min(SIZE_MIN).max(SIZE_MAX);

/** Коди з бірки (style, color) — рукописні числові коди, зберігаються як текст. */
export const tagCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^\d+$/, 'Очікується числовий код з бірки');

/** Грошове значення у гривнях: додатне, до двох знаків після коми. */
export const moneySchema = z.number().positive().max(1_000_000).multipleOf(0.01);
