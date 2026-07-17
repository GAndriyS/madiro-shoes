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
    const flatten = (obj: object, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null
          ? flatten(value, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );
    expect(flatten(en).sort()).toEqual(flatten(uk).sort());
  });
});
