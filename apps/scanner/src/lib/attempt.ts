import { newIdempotencyKey, outcomeUnknown } from '@madiro/web-core';
import { useRef } from 'react';

/**
 * The Idempotency-Key of one attempt at a write (spec §5.2). An attempt is
 * named by what it acts on — the pair being checked out, the sale being
 * reversed, the intake form being saved — and its key lives until the attempt
 * succeeds. Every retry in between, the automatic one and the seller's own
 * second tap, resends the same key, so a request whose response was lost can
 * only ever be answered again, never carried out twice.
 *
 * Naming the attempt by its target rather than by its payload is deliberate: a
 * seller who changes the price after «no answer» and taps again is still
 * retrying the checkout of that pair. If the first tap did land, the API says
 * so (422) instead of quietly treating the edit as a second sale.
 */
export function useAttemptKey() {
  const attempt = useRef<{ target: string; key: string } | null>(null);
  return {
    keyFor(target: string): string {
      if (attempt.current?.target !== target) {
        attempt.current = { target, key: newIdempotencyKey() };
      }
      return attempt.current.key;
    },
    /** The attempt is over — the next write is a new one with a new key. */
    settle(): void {
      attempt.current = null;
    },
  };
}

/**
 * Mutation options for a keyed write: one automatic retry, and only when the
 * first try's outcome is unknown. It is safe because it resends the same key;
 * a refusal (4xx) is final and is not retried.
 */
export const retryUnknownOutcome = {
  retry: (failureCount: number, error: unknown) => failureCount < 1 && outcomeUnknown(error),
  retryDelay: 1_000,
};

/** A failed write whose outcome is unknown, as opposed to one the API refused. */
export function failedWithUnknownOutcome(mutation: { isError: boolean; error: unknown }): boolean {
  return mutation.isError && outcomeUnknown(mutation.error);
}
