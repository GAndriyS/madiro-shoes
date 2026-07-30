import { beforeAll, describe, expect, it } from 'vitest';

import { initI18n, setLanguage } from '../src/i18n/core';
import { dayLabel, money, num, timeOf } from '../src/lib/format';

// The formatters must follow the ACTIVE interface language (audit F-8, S-10):
// EN mode with Ukrainian number/time formats reads half-translated.
describe('format follows the interface language', () => {
  beforeAll(() => {
    initI18n({
      uk: { translation: { common: { today: 'сьогодні', yesterday: 'вчора' } } },
      en: { translation: { common: { today: 'today', yesterday: 'yesterday' } } },
    });
  });

  it('uk: пробіл у тисячах, 24-годинний час', () => {
    setLanguage('uk');
    expect(money(21200)).toBe(`${(21200).toLocaleString('uk-UA')} ₴`);
    expect(num(-1400)).toBe(`−${(1400).toLocaleString('uk-UA')}`);
    expect(timeOf('2026-07-30T14:05:00')).toBe('14:05');
  });

  it('en: англійське групування розрядів і 24-годинний час', () => {
    setLanguage('en');
    expect(money(21200)).toBe(`${(21200).toLocaleString('en-GB')} ₴`);
    expect(timeOf('2026-07-30T14:05:00')).toBe('14:05');
    setLanguage('uk');
  });

  it('dayLabel перекладає «сьогодні» разом із мовою', () => {
    const now = new Date().toISOString();
    setLanguage('en');
    expect(dayLabel(now)).toMatch(/^today /);
    setLanguage('uk');
    expect(dayLabel(now)).toMatch(/^сьогодні /);
  });
});
