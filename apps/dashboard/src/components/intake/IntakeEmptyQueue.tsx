import { useTranslation } from 'react-i18next';

import { CheckIcon } from '@madiro/web-core';

/** Empty queue state (design 3d). */
export function IntakeEmptyQueue() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 rounded-[14px] border border-border bg-surface py-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success">
        <CheckIcon size={24} strokeWidth={1.8} />
      </div>
      <div className="font-display text-2xl font-semibold text-ink">{t('intake.emptyTitle')}</div>
      <div className="text-center text-[13px] leading-normal whitespace-pre-line text-text-muted">
        {t('intake.emptyBody')}
      </div>
    </div>
  );
}
