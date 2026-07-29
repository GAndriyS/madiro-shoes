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

/** Store-timezone calendar day of an ISO timestamp, as `YYYY-MM-DD`. */
export function dayKeyOf(iso: string, timeZone: string = STORE_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * Group consecutive rows by their store-timezone calendar day (FR-S-17: «Мої
 * продажі» за місяць групуються по днях). The API returns operations sorted
 * by time, so one pass is enough and the day order is preserved.
 */
export function groupByDay<T>(items: readonly T[], at: (item: T) => string) {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = dayKeyOf(at(item));
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(item);
    } else {
      groups.push({ day, items: [item] });
    }
  }
  return groups;
}

/** «12.07» from a `YYYY-MM-DD` day key — the header for days before yesterday. */
export function dayKeyShort(dayKey: string): string {
  return `${dayKey.slice(8, 10)}.${dayKey.slice(5, 7)}`;
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
