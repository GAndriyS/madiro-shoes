import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import { initI18n, setLanguage } from '../src/i18n';
import { en } from '../src/i18n/locales/en';
import { uk } from '../src/i18n/locales/uk';

describe('i18n', () => {
  beforeAll(() => {
    initI18n();
  });

  it('українська — мова за замовчуванням', () => {
    expect(i18next.t('login.submit')).toBe('Увійти');
  });

  it('перемикання на EN працює', () => {
    setLanguage('en');
    expect(i18next.t('login.submit')).toBe('Log in');
    setLanguage('uk');
  });

  it('EN покриває всі ключі УКР (жодних непекладених дірок)', () => {
    // Суфікси множини (_one/_few/_many/_other) у мов різні — порівнюємо базові ключі.
    const flatten = (obj: object, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null
          ? flatten(value, `${prefix}${key}.`)
          : [`${prefix}${key}`.replace(/_(one|few|many|other)$/, '')],
      );
    const unique = (keys: string[]) => [...new Set(keys)].sort();
    expect(unique(flatten(en))).toEqual(unique(flatten(uk)));
  });
});
