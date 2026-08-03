import { z } from 'zod';

/**
 * The shop buys in dollars and sells in hryvnia, so a purchase price is entered
 * in USD and stored converted. The rate is the mid of the cash buy/sell spread
 * — the rate at which money is really exchanged, not the official one.
 */
export const EXCHANGE_BASE_CURRENCY = 'UAH';
export const EXCHANGE_PRICED_CURRENCY = 'USD';

export const exchangeRateSchema = z.object({
  /** Hryvnia per one dollar. */
  rate: z.number().positive(),
  /** When the rate was actually obtained from the provider. */
  fetchedAt: z.string(),
  /**
   * True when the provider could not be reached and this is the last known
   * rate. The UI says so out loud — a price converted at a stale rate is still
   * a real number in the books.
   */
  stale: z.boolean(),
});
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;

/**
 * Hryvnia for a dollar amount, rounded to whole hryvnia — the unit everything
 * downstream (stock, margin, statistics) is denominated in. Shared so the form
 * previews exactly what the API will store, instead of approximating it.
 */
export function usdToUah(usd: number, rate: number): number {
  return Math.round(usd * rate);
}
