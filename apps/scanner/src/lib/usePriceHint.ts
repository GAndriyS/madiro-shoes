import {
  priceHintResponseSchema,
  type Material,
  type PriceHintResponse,
  type Season,
} from '@madiro/shared';
import { api } from '@madiro/web-core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** The admin edits the tag fields by hand; wait for the typing to settle. */
const DEBOUNCE_MS = 400;

export interface PriceHintIdentity {
  style: string;
  color: string;
  material: Material | null;
  season: Season;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

/**
 * Purchase price of the variant these fields identify (FR-D-08, «підказка
 * ціни»), or null when there is nothing to suggest.
 *
 * Pass `null` for a seller: the endpoint is admin-only because it returns a
 * purchase price (FR-B-02), so a seller must not even ask.
 */
export function usePriceHint(identity: PriceHintIdentity | null): number | null {
  // Serialized, so the debounce reacts to the identity's value and not to the
  // new object the parent creates on every render.
  const key = identity
    ? [identity.style, identity.color, identity.material ?? '', identity.season].join('|')
    : '';
  const settledKey = useDebounced(key, DEBOUNCE_MS);

  const query = useQuery({
    queryKey: ['intake', 'price-hint', settledKey],
    // Style and colour are what make a variant findable at all; without them
    // the answer could only ever be "nothing".
    enabled:
      identity != null &&
      settledKey === key &&
      identity.style.length > 0 &&
      identity.color.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ style: identity!.style, color: identity!.color });
      if (identity!.material) params.set('material', identity!.material);
      params.set('season', identity!.season);
      return priceHintResponseSchema.parse(
        await api.get<PriceHintResponse>(`/intake/price-hint?${params.toString()}`),
      );
    },
    // A hint is a convenience: a failed lookup leaves the field empty, never an error.
    retry: false,
  });

  return query.data?.purchasePrice ?? null;
}
