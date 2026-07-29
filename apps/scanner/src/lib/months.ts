import { STORE_TIMEZONE } from '@madiro/shared';

/**
 * Calendar months as `YYYY-MM`, in the store's timezone.
 *
 * The phone's own clock is not the authority: a seller travelling, or a device
 * left on the wrong timezone, must still see the same «поточний місяць» the
 * backend computes for the shop.
 */
export function currentMonthKey(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, so the month key is just its first 7 characters.
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return date.slice(0, 7);
}

/** Step a month key by whole months; handles the year boundary in both directions. */
export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number) as [number, number];
  // Months as a zero-based running count, so ±1 never needs a rollover branch.
  const total = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(total / 12);
  const shiftedMonth = (total % 12) + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`;
}

/**
 * «Липень 2026» / «July 2026» — capitalised, since Ukrainian month names are
 * lowercase.
 *
 * The year is appended by hand rather than asked of Intl: the uk-UA locale
 * formats a month-and-year as «липень 2026 р.», and that trailing « р.» is
 * noise in a compact switcher.
 */
export function monthLabel(key: string, language: string): string {
  const [year, month] = key.split('-').map(Number) as [number, number];
  const name = new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}
