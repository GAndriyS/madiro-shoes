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

/**
 * A purchase price **in US dollars** — the currency the shop actually buys in.
 * The API converts it to hryvnia at save time and stores whole hryvnia; nothing
 * downstream (stock, margin, statistics) ever sees dollars.
 *
 * `0` is a real answer here: «без ціни — старий товар» is a deliberate decision
 * of the admin, distinct from null «ще не вказана» (spec §2.2 #4). Sale prices
 * keep `moneySchema` in hryvnia — the customer pays hryvnia, and selling for
 * 0 ₴ is not a decision, it is a typo.
 */
export const purchasePriceUsdSchema = z.number().min(0).max(100_000).multipleOf(0.01);
