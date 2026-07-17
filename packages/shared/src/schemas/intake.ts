import { z } from 'zod';

import { MATERIALS, SEASONS } from '../enums.js';

/** One size in a queued variant; `sold` marks the sold-before-pricing case (FR-D-11). */
export const intakeQueueSizeSchema = z.object({
  pairId: z.string(),
  size: z.number().int(),
  sold: z.boolean(),
  soldPrice: z.number().nullable(),
});
export type IntakeQueueSize = z.infer<typeof intakeQueueSizeSchema>;

/** "Awaiting price" queue card — one per variant (FR-D-11). */
export const intakeQueueItemSchema = z.object({
  variantId: z.string(),
  style: z.string(),
  color: z.string(),
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS).nullable(),
  sellerName: z.string(),
  createdAt: z.string(),
  /** Hint: this variant last came in at this price; null if never priced. */
  lastPurchasePrice: z.number().nullable(),
  sizes: z.array(intakeQueueSizeSchema),
});
export type IntakeQueueItem = z.infer<typeof intakeQueueItemSchema>;

export const intakeQueueResponseSchema = z.object({
  items: z.array(intakeQueueItemSchema),
  summary: z.object({
    awaitingPairs: z.number().int(),
    variants: z.number().int(),
    sellers: z.number().int(),
  }),
});
export type IntakeQueueResponse = z.infer<typeof intakeQueueResponseSchema>;

/** Intake history row (FR-D-12). */
export const intakeHistoryEntrySchema = z.object({
  id: z.string(),
  style: z.string(),
  color: z.string(),
  sizes: z.array(z.number().int()),
  date: z.string(),
  actorName: z.string(),
  material: z.enum(MATERIALS).nullable(),
  season: z.enum(SEASONS).nullable(),
  /** Historical purchase price; null means confirmed as "no price — old stock". */
  purchasePrice: z.number().nullable(),
});
export type IntakeHistoryEntry = z.infer<typeof intakeHistoryEntrySchema>;

export const intakeHistoryResponseSchema = z.object({
  items: z.array(intakeHistoryEntrySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  monthSummary: z.object({
    pairs: z.number().int(),
    total: z.number(),
    pairsWithoutPrice: z.number().int(),
  }),
});
export type IntakeHistoryResponse = z.infer<typeof intakeHistoryResponseSchema>;
