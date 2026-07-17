import type { IntakeHistoryResponse } from '@madiro/shared';
import { useTranslation } from 'react-i18next';

import { money } from '../../lib/format';
import { materialSeason } from '../stock/labels';

interface Props {
  data: IntakeHistoryResponse;
  onPage: (page: number) => void;
}

function shortDM(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

/** Intake history list + monthly summary tile (design 3a). */
export function IntakeHistory({ data, onPage }: Props) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
        {t('intake.historyLabel')}
      </span>
      <div className="flex flex-1 flex-col rounded-[14px] border border-border bg-surface px-5">
        {data.items.map((e, i) => (
          <div
            key={e.id}
            className={`flex items-baseline justify-between gap-3 py-3 ${
              i < data.items.length - 1 ? 'border-b border-border-row' : ''
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-bold text-ink">
                {e.style} · {e.color} —{' '}
                {e.sizes.map((s) => t('intake.sizeShort', { size: s })).join(', ')}
              </span>
              <span className="text-[11.5px] text-text-muted">
                {shortDM(e.date)} · {e.actorName} · {materialSeason(t, e.material, e.season)}
              </span>
            </div>
            <span
              className={`text-[13px] font-bold ${
                e.purchasePrice == null ? 'text-amber-text' : 'text-text'
              }`}
            >
              {e.purchasePrice == null ? t('intake.historyNoPrice') : money(e.purchasePrice)}
            </span>
          </div>
        ))}
        <div className="mt-auto flex items-center justify-between border-t border-border py-3 text-[11.5px] text-text-faint">
          <span>{t('intake.historyShown', { shown: data.items.length, total: data.total })}</span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => onPage(data.page - 1)}
              className="rounded-[7px] border border-border-input px-2.5 py-1 disabled:opacity-40"
            >
              ←
            </button>
            <span className="rounded-[7px] bg-ink px-2.5 py-1 font-bold text-page">
              {data.page}
            </span>
            <button
              type="button"
              disabled={data.page >= pages}
              onClick={() => onPage(data.page + 1)}
              className="rounded-[7px] border border-border-input px-2.5 py-1 disabled:opacity-40"
            >
              →
            </button>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 rounded-[14px] border border-border bg-surface px-5 py-4">
        <span className="text-[11px] font-bold tracking-[1.2px] text-text-muted">
          {t('intake.monthLabel')}
        </span>
        <span className="font-display text-[26px] font-semibold text-ink">
          {t('intake.monthSummary', {
            count: data.monthSummary.pairs,
            pairs: data.monthSummary.pairs,
            total: money(data.monthSummary.total),
          })}
        </span>
        {data.monthSummary.pairsWithoutPrice > 0 && (
          <span className="text-[11.5px] text-amber-text">
            {t('intake.monthWithoutPrice', { count: data.monthSummary.pairsWithoutPrice })}
          </span>
        )}
      </div>
    </div>
  );
}
