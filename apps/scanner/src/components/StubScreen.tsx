import { ChevronRightIcon } from '@madiro/web-core';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Placeholder screen for a flow that lands in an upcoming PR; navigation is real. */
export function StubScreen({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-4 pb-7">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary"
        >
          <ChevronRightIcon size={16} className="rotate-180" />
        </Link>
        <h1 className="font-display text-[26px] font-semibold text-ink">{t(titleKey)}</h1>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-surface px-8 text-center text-[13.5px] leading-relaxed text-text-muted">
        {t('stubs.body')}
      </div>
    </div>
  );
}
