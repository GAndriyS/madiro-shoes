import { useTranslation } from 'react-i18next';

import { useOnline } from '../lib/useOnline';

/** Sticky top banner while offline; no offline queue by design (audit #1). */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();

  if (online) {
    return null;
  }
  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-danger px-4 py-2.5 text-center text-[12.5px] font-bold text-white"
    >
      {t('offline.banner')}
    </div>
  );
}
