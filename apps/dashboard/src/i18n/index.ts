import { initI18n as initI18nCore } from '@madiro/web-core';

import { en } from './locales/en';
import { uk } from './locales/uk';

export { getStoredLanguage, setLanguage, type AppLanguage } from '@madiro/web-core';

export function initI18n(): void {
  initI18nCore({
    uk: { translation: uk },
    en: { translation: en },
  });
}
