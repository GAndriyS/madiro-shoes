import { STORE_TIMEZONE } from '@madiro/shared';

/**
 * Start of "today" in the store's timezone (Europe/Kyiv), as a UTC Date.
 * Statistics day boundaries follow the store clock regardless of server TZ
 * (requirements-analysis, section 7 item 11).
 */
export function storeDayStart(now: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  // Wall-clock time in the store TZ, then shift back by the elapsed time since local midnight.
  const sinceMidnightMs =
    Number(parts['hour']) * 3_600_000 +
    Number(parts['minute']) * 60_000 +
    Number(parts['second']) * 1_000;
  return new Date(now.getTime() - now.getMilliseconds() - sinceMidnightMs);
}

/**
 * Start of the current month in the store's timezone, as a UTC Date.
 * Derived by walking back whole days from today's store-day start; a DST
 * transition inside the month may skew this by an hour — irrelevant at the
 * "my sales for the month" granularity.
 */
export function storeMonthStart(now: Date = new Date()): Date {
  const dayStart = storeDayStart(now);
  const dayOfMonth = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIMEZONE, day: 'numeric' }).format(now),
  );
  return new Date(dayStart.getTime() - (dayOfMonth - 1) * 86_400_000);
}

/**
 * Store-timezone midnight of a calendar date ("YYYY-MM-DD") as a UTC Date.
 * Noon UTC of that date falls on the same Kyiv calendar day (UTC+2/+3),
 * so its store-day start is exactly the requested midnight.
 */
export function storeDayStartOf(date: string): Date {
  return storeDayStart(new Date(`${date}T12:00:00Z`));
}

/** The store-timezone hour (0-23) of an instant — buckets the hourly chart. */
export function storeHourOf(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: STORE_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    }).format(at),
  );
}
