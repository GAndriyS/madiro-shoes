import { z } from 'zod';

/**
 * Realtime contract (FR-B-04 / NFR-03). The dashboard must reflect what happens
 * in the scanner without a reload: a draft scanned in the hall shows up in the
 * «Очікують ціни» queue, the nav badge moves, a sale lands in the feed and the
 * KPIs follow.
 *
 * The payload deliberately carries no domain data — only what changed. Clients
 * react by refetching through the same authorized endpoints they already use,
 * so nothing sensitive (purchase prices, margins) ever travels over the socket,
 * and a seller's connection cannot become a side channel around FR-B-02.
 */
export const REALTIME_NAMESPACE = '/realtime';

/** Single event name; the topic inside says what moved. */
export const REALTIME_EVENT = 'changed';

export const REALTIME_TOPICS = [
  /** A seller saved an intake draft, edited or deleted one. */
  'intake-draft',
  /** The admin set a purchase price or marked «без ціни». */
  'intake-priced',
  'sale',
  'return',
  'writeoff',
] as const;
export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];

export const realtimeEventSchema = z.object({
  topic: z.enum(REALTIME_TOPICS),
  /** Server time of the change, ISO — lets a client ignore stale replays. */
  at: z.string(),
});
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
