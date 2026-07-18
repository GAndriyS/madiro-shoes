import type { IntakeQueueItem } from '@madiro/shared';
import { useTranslation } from 'react-i18next';

import { dayLabel, money } from '@madiro/web-core';
import { materialSeason } from '../stock/labels';

interface Props {
  item: IntakeQueueItem;
  onSetPrice: (item: IntakeQueueItem) => void;
  onNoPrice: (item: IntakeQueueItem) => void;
}

/** "Awaiting price" queue card, one per variant (design 3a). */
export function IntakeQueueCard({ item, onSetPrice, onNoPrice }: Props) {
  const { t } = useTranslation();
  const hasSold = item.sizes.some((s) => s.sold);
  const soldSize = item.sizes.find((s) => s.sold);
  const inStockCount = item.sizes.filter((s) => !s.sold).length;

  return (
    <div
      className={`flex flex-col gap-3 rounded-[14px] border bg-surface px-[18px] py-4 md:px-[22px] md:py-[18px] ${
        hasSold ? 'border-amber-border' : 'border-border'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-lg font-semibold text-ink md:text-[22px]">
          {item.style} · {t('intake.colorLabel')} {item.color}
        </span>
        <span className="text-right text-[11.5px] text-text-muted md:text-xs">
          {materialSeason(t, item.material, item.season)} · {item.sellerName} ·{' '}
          {dayLabel(item.createdAt)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {item.sizes.map((s) =>
          s.sold ? (
            <span
              key={s.pairId}
              className="rounded-[7px] bg-danger px-2.5 py-[3px] text-xs font-bold text-white"
            >
              {t('intake.soldChip', { size: s.size })}
            </span>
          ) : (
            <span
              key={s.pairId}
              className="rounded-[7px] bg-amber-bg px-2.5 py-[3px] text-xs font-bold text-amber-text"
            >
              {t('intake.sizeShort', { size: s.size })}
            </span>
          ),
        )}
        {hasSold && soldSize?.soldPrice != null ? (
          <span className="text-xs font-bold text-amber-text">
            {t('intake.soldHint', { price: money(soldSize.soldPrice) })}
          </span>
        ) : item.lastPurchasePrice != null ? (
          <span className="text-xs text-text-muted">
            {t('intake.lastPriceHint', { price: money(item.lastPurchasePrice) })}
          </span>
        ) : (
          inStockCount > 0 && (
            <span className="text-xs text-text-muted">
              {t('intake.queuePairsHint', { count: inStockCount })}
            </span>
          )
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSetPrice(item)}
          className="rounded-[10px] bg-accent px-[18px] py-2.5 text-[12.5px] font-bold text-white max-md:flex-1"
        >
          {t('intake.setPrice')}
        </button>
        <button
          type="button"
          onClick={() => onNoPrice(item)}
          className="rounded-[10px] border-[1.5px] border-border-input px-[18px] py-2.5 text-[12.5px] font-semibold text-text-secondary max-md:flex-1"
        >
          <span className="md:hidden">{t('intake.noPriceShort')}</span>
          <span className="hidden md:inline">{t('intake.noPrice')}</span>
        </button>
      </div>
    </div>
  );
}
