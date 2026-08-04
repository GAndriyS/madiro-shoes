import { exchangeRateSchema, usdToUah, type ExchangeRate } from '@madiro/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from './api';

/**
 * The rate purchase-price forms preview with. Both apps price in dollars and
 * store hryvnia, and both need to show the admin what will actually be written.
 *
 * The API caches the rate for 15 minutes and converts with the same number at
 * save time, so this preview is the value that lands in the books — not an
 * approximation of it. Refetching is therefore pointless within that window.
 */
export function useExchangeRate(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['exchange', 'rate'],
    // The endpoint is admin-only, because only an admin prices anything: a
    // seller's form must not ask and collect a 403 (FR-B-02).
    enabled: options.enabled ?? true,
    queryFn: async () => exchangeRateSchema.parse(await api.get<ExchangeRate>('/exchange/rate')),
    staleTime: 5 * 60 * 1000,
    // A missing rate is a real state the form has to render, not a retry loop.
    retry: 1,
  });
}

/** Hryvnia a dollar amount converts to, or null while no rate is known. */
export function previewUah(usd: number, rate: number | undefined): number | null {
  if (rate == null || !Number.isFinite(usd)) return null;
  return usdToUah(usd, rate);
}
