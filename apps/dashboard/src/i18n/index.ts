import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './locales/en';
import { uk } from './locales/uk';

export const LANGUAGE_STORAGE_KEY = 'madiro.language';

export type AppLanguage = 'uk' | 'en';

export function getStoredLanguage(): AppLanguage {
  return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'uk';
}

/** Language is picked only on the login screen (NFR-04) and stored locally. */
export function setLanguage(lang: AppLanguage): void {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  void i18next.changeLanguage(lang);
}

export function initI18n(): void {
  void i18next.use(initReactI18next).init({
    resources: {
      uk: { translation: uk },
      en: { translation: en },
    },
    lng: getStoredLanguage(),
    fallbackLng: 'uk',
    interpolation: { escapeValue: false },
  });
}
