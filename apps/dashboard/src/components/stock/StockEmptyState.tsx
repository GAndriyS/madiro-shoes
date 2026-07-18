import { useTranslation } from 'react-i18next';

import { SearchIcon } from '@madiro/web-core';

interface Props {
  query: string;
  onReset: () => void;
}

/** Empty search result (design 2g). */
export function StockEmptyState({ query, onReset }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 py-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-border-row text-text-muted">
        <SearchIcon size={24} strokeWidth={1.8} />
      </div>
      <div className="font-display text-2xl font-semibold text-ink">
        {t('stock.emptyTitle', { query })}
      </div>
      <div className="text-center text-[13px] leading-normal whitespace-pre-line text-text-muted">
        {t('stock.emptyBody')}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="rounded-[11px] border-[1.5px] border-border-input px-5 py-2.5 text-[13px] font-semibold text-text-secondary"
      >
        {t('stock.emptyReset')}
      </button>
    </div>
  );
}
