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
