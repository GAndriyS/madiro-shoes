import i18next from 'i18next';

/** «21 200 ₴», від'ємні — з типографським мінусом: «−2 700 ₴». */
export function money(value: number): string {
  const formatted = Math.abs(value).toLocaleString('uk-UA', { maximumFractionDigits: 0 });
  return `${value < 0 ? '−' : ''}${formatted} ₴`;
}

/** Число без валюти: «1 450» / «−1 400» (для маржі в стрічці, як у дизайні). */
export function num(value: number): string {
  const formatted = Math.abs(value).toLocaleString('uk-UA', { maximumFractionDigits: 0 });
  return `${value < 0 ? '−' : ''}${formatted}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return (first + second).toUpperCase();
}

const TIME = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });

export function timeOf(isoDate: string): string {
  return TIME.format(new Date(isoDate));
}

/** «сьогодні 10:02» / «вчора 16:40» / «12.07 15:12». */
export function dayLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const time = TIME.format(date);
  if (diffDays === 0) {
    return `${i18next.t('common.today')} ${time}`;
  }
  if (diffDays === 1) {
    return `${i18next.t('common.yesterday')} ${time}`;
  }
  const dm = date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
  return `${dm} ${time}`;
}

/** Коротка дата: «8 лип» (для підписів чартів і діапазонів періоду). */
export function shortDay(isoDate: string): string {
  return new Date(isoDate)
    .toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** Заголовок сторінки: «вівторок, 14 липня» (повний) або «14 липня» (короткий). */
export function titleDate(lang: string, withWeekday: boolean): string {
  const locale = lang === 'en' ? 'en-GB' : 'uk-UA';
  return new Date().toLocaleDateString(locale, {
    ...(withWeekday ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'long',
  });
}
