import { z } from 'zod';

import { MATERIALS, PAYMENT_METHODS, SEASONS } from '../enums.js';
import { moneySchema, sizeSchema, tagCodeSchema } from './common.js';

/**
 * Поступлення пари (FR-S-11/12): три поля з бірки + опційні матеріал
 * і утеплення. Ціну закупки вказує лише адмін; продавець створює чернетку.
 */
export const intakeSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).optional(),
  season: z.enum(SEASONS).optional(),
  /** Лише для адміна; null явно означає «без ціни — старий товар». */
  purchasePrice: moneySchema.nullable().optional(),
});
export type IntakeInput = z.infer<typeof intakeSchema>;

/** Пошук пари за 5 полями ідентичності (розділ 3.2). */
export const pairLookupSchema = z.object({
  size: sizeSchema,
  color: tagCodeSchema,
  style: tagCodeSchema,
  material: z.enum(MATERIALS).optional(),
  season: z.enum(SEASONS).optional(),
});
export type PairLookupInput = z.infer<typeof pairLookupSchema>;

/** Продаж (FR-S-07): кінцева ціна вводиться при кожному продажі. */
export const saleSchema = z.object({
  pairId: z.string().min(1),
  salePrice: moneySchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
});
export type SaleInput = z.infer<typeof saleSchema>;

/** Списання (FR-S-08): без ціни, опційний коментар-причина. */
export const writeoffSchema = z.object({
  pairId: z.string().min(1),
  comment: z.string().trim().max(500).optional(),
});
export type WriteoffInput = z.infer<typeof writeoffSchema>;

/** Вказання ціни закупки варіанта з черги (FR-D-08); null — «без ціни — старий товар». */
export const setPurchasePriceSchema = z.object({
  variantId: z.string().min(1),
  purchasePrice: moneySchema.nullable(),
});
export type SetPurchasePriceInput = z.infer<typeof setPurchasePriceSchema>;
