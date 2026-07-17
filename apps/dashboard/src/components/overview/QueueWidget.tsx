import type { QueueItem } from '@madiro/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { dayLabel } from '../../lib/format';

/** Віджет черги «Очікують ціни» (дизайн 1a): кнопка «Ціна», продана-без-ціни — акцент. */
export function QueueWidget({ items }: { items: QueueItem[] }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface px-[18px] py-4 md:px-[22px] md:py-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-extrabold text-ink md:text-[13px]">
          {t('overview.queueTitle')}
        </span>
        <Link to="/intake" className="text-[11.5px] font-semibold text-accent-hover">
          {t('overview.queueAll')}
        </Link>
      </div>
      <div className="flex flex-col">
        {items.map((item, i) => {
          const sold = item.soldAt != null;
          return (
            <div
              key={item.pairId}
              className={`flex items-center justify-between py-2.5 ${
                i < items.length - 1 ? 'border-b border-border-row' : ''
              }`}
            >
              <div className="flex flex-col">
                <span className={`text-[13px] font-bold ${sold ? 'text-[#7c4530]' : 'text-ink'}`}>
                  {item.style} · {item.color} · р. {item.size}
                  {sold && ` · ${t('overview.queueSold')}`}
                </span>
                <span className="text-[11px] text-text-muted">
                  {item.sellerName} · {dayLabel(item.createdAt)}
                  {sold && ` · ${t('overview.queueSoldToday')}`}
                </span>
              </div>
              <Link
                to="/intake"
                className={`rounded-lg px-3 py-[5px] text-[11.5px] font-bold ${
                  sold ? 'bg-danger text-white' : 'bg-ink text-page'
                }`}
              >
                {t('overview.queuePrice')}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
