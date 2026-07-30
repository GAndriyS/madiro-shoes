import i18next from 'i18next';

/**
 * Everything below formats through the ACTIVE interface language (F-8):
 * uk → uk-UA, en → en-GB. Numbers, times and dates must switch together
 * with the copy, or the EN mode reads half-translated.
 */
function locale(): string {
  return i18next.language === 'en' ? 'en-GB' : 'uk-UA';
}

/** «21 200 ₴»; negatives use the typographic minus: «−2 700 ₴». */
export function money(value: number): string {
  const formatted = Math.abs(value).toLocaleString(locale(), { maximumFractionDigits: 0 });
  return `${value < 0 ? '−' : ''}${formatted} ₴`;
}

/** Number without currency: «1 450» / «−1 400» (feed margin column, per design). */
export function num(value: number): string {
  const formatted = Math.abs(value).toLocaleString(locale(), { maximumFractionDigits: 0 });
  return `${value < 0 ? '−' : ''}${formatted}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return (first + second).toUpperCase();
}

// One Intl.DateTimeFormat per locale — they are expensive to construct.
const timeFormats = new Map<string, Intl.DateTimeFormat>();
function timeFormat(): Intl.DateTimeFormat {
  const key = locale();
  let format = timeFormats.get(key);
  if (!format) {
    // hourCycle pins 00:15 over «24:15» (uk-UA) and over 12-hour AM/PM (en-GB).
    format = new Intl.DateTimeFormat(key, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    timeFormats.set(key, format);
  }
  return format;
}

export function timeOf(isoDate: string): string {
  return timeFormat().format(new Date(isoDate));
}

/** «сьогодні 10:02» / «вчора 16:40» / «12.07 15:12» day-relative label. */
export function dayLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const time = timeFormat().format(date);
  if (diffDays === 0) {
    return `${i18next.t('common.today')} ${time}`;
  }
  if (diffDays === 1) {
    return `${i18next.t('common.yesterday')} ${time}`;
  }
  const dm = date.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
  return `${dm} ${time}`;
}

/** Short date: «8 лип» (chart labels and period ranges). */
export function shortDay(isoDate: string): string {
  return new Date(isoDate)
    .toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** Page title date: «вівторок, 14 липня» (full) or «14 липня» (short). */
export function titleDate(lang: string, withWeekday: boolean): string {
  const locale = lang === 'en' ? 'en-GB' : 'uk-UA';
  return new Date().toLocaleDateString(locale, {
    ...(withWeekday ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'long',
  });
}
