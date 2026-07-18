import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

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

/**
 * Initializes i18next with app-provided resources. Each app supplies its own
 * locale files, but they MUST include the `common.*` keys consumed by shared
 * web-core components (QueryState).
 */
export function initI18n(resources: Resource): void {
  void i18next.use(initReactI18next).init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: 'uk',
    interpolation: { escapeValue: false },
  });
}
