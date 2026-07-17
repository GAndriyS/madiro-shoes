import type { StockVariantRow } from '@madiro/shared';
import { useTranslation } from 'react-i18next';

import { materialSeason, pricedPurchaseLabel } from './labels';

interface Props {
  rows: StockVariantRow[];
  onRowClick: (row: StockVariantRow) => void;
}

/** Mobile (<768): variant cards instead of the table (design 2c). */
export function StockCardsMobile({ rows, onRowClick }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2.5 md:hidden">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onRowClick(row)}
          className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-left"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-extrabold text-ink">
              {row.style} · {row.color}
            </span>
            <span className="text-xs font-bold">
              {row.purchasePrice == null ? (
                <span className="text-amber-text">
                  {t('stock.colPurchase').toLowerCase()}: {t('stock.setPrice')}
                </span>
              ) : (
                <span className="font-normal text-text-muted">
                  {pricedPurchaseLabel(t, row.purchasePrice)}
                </span>
              )}
            </span>
          </div>
          <div className="text-xs text-text-muted">
            {materialSeason(t, row.material, row.season)} ·{' '}
            {t('overview.pairs', { count: row.pairsCount })}
          </div>
          <div className="flex flex-wrap items-center gap-[5px]">
            {row.sizes.map((s) => (
              <span
                key={s}
                className="rounded-md border border-border-input px-[9px] py-0.5 text-xs text-text"
              >
                {s}
              </span>
            ))}
            {row.awaitingPriceCount > 0 && (
              <span className="rounded-md bg-amber-bg px-[9px] py-0.5 text-[11px] font-bold text-amber-text">
                {t('stock.awaitingChip', { count: row.awaitingPriceCount })}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
