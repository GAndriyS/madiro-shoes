import { useTranslation } from 'react-i18next';

import { cn } from '@madiro/web-core';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  onPage: (page: number) => void;
}

/** Footer pagination (design 2a): «Показано N із T» + page buttons. */
export function StockPagination({ page, pageSize, total, shown, onPage }: Props) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between border-t border-border px-[18px] py-3 text-xs text-text-faint lg:px-[22px]">
      <span>
        {t('stock.shown', { shown, total })}
        <span className="hidden lg:inline"> · {t('stock.shownHintDesktop')}</span>
        <span className="hidden md:max-lg:inline"> · {t('stock.shownHintTablet')}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-[7px] border border-border-input px-2.5 py-1 disabled:opacity-40"
        >
          ←
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === pages)
          .map((p, i, arr) => (
            <span key={p} className="flex items-center gap-1.5">
              {i > 0 && (arr[i - 1] ?? 0) < p - 1 && <span>…</span>}
              <button
                type="button"
                onClick={() => onPage(p)}
                className={cn(
                  'rounded-[7px] px-2.5 py-1',
                  p === page ? 'bg-ink font-bold text-page' : 'border border-border-input',
                )}
              >
                {p}
              </button>
            </span>
          ))}
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="rounded-[7px] border border-border-input px-2.5 py-1 disabled:opacity-40"
        >
          →
        </button>
      </span>
    </div>
  );
}
