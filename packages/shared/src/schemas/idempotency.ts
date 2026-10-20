import { z } from 'zod';

/**
 * Header the scanner sends on every request that moves stock or money
 * (`POST /intake`, `/sale`, `/sale/writeoff`, `/returns`). The value names one
 * attempt by the person at the counter: it is minted on the first tap and
 * resent on every retry of that tap, so a response lost on mobile data can be
 * asked for again without a second sale or a second batch of pairs (spec §5.2).
 *
 * Lower-case because that is how Node hands incoming headers to the API.
 */
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/** A random UUID — long enough that two attempts never collide by chance. */
export const idempotencyKeySchema = z.uuid();
