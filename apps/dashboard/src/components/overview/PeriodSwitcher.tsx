import type { OverviewPeriod } from '@madiro/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CalendarIcon } from '../layout/icons';

export interface PeriodValue {
  period: OverviewPeriod;
  from?: string;
  to?: string;
}

interface Props {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
}

const PRESETS = [
  { period: 'today', key: 'overview.periodToday' },
  { period: 'week', key: 'overview.periodWeek' },
  { period: 'month', key: 'overview.periodMonth' },
] as const;

/** Сегмент-контрол періоду з дизайну 1a; «Період» — довільний діапазон дат. */
export function PeriodSwitcher({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [rangeOpen, setRangeOpen] = useState(false);

  return (
    <div className="relative">
      {/* Мобільний варіант: компактний select (дизайн 1c: «Сьогодні ▾») */}
      <select
        value={value.period === 'custom' ? 'month' : value.period}
        onChange={(e) => onChange({ period: e.target.value as OverviewPeriod })}
        className="bg-transparent text-xs font-semibold text-accent md:hidden"
      >
        {PRESETS.map(({ period, key }) => (
          <option key={period} value={period}>
            {t(key)}
          </option>
        ))}
      </select>

      {/* Десктоп/планшет: сегмент */}
      <div className="hidden items-stretch rounded-[10px] bg-segment p-[3px] md:flex">
        {PRESETS.map(({ period, key }) => (
          <button
            key={period}
            type="button"
            onClick={() => {
              setRangeOpen(false);
              onChange({ period });
            }}
            className={
              value.period === period
                ? 'rounded-lg bg-surface px-3.5 py-1.5 text-xs font-bold text-ink'
                : 'px-3.5 py-1.5 text-xs text-text-secondary'
            }
          >
            {t(key)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRangeOpen((v) => !v)}
          className={`ml-[3px] flex items-center gap-1.5 border-l border-border-input px-3 py-1.5 text-xs ${
            value.period === 'custom' ? 'font-bold text-ink' : 'text-text-secondary'
          }`}
        >
          <CalendarIcon size={13} />
          {t('overview.periodCustom')}
        </button>
      </div>

      {rangeOpen && (
        <div className="absolute top-full right-0 z-20 mt-2 flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-xs shadow-modal">
          <span className="text-text-muted">{t('overview.from')}</span>
          <input
            type="date"
            value={value.from ?? ''}
            onChange={(e) => onChange({ period: 'custom', from: e.target.value, to: value.to })}
            className="rounded-lg border border-border-input px-2 py-1.5"
          />
          <span className="text-text-muted">{t('overview.to')}</span>
          <input
            type="date"
            value={value.to ?? ''}
            onChange={(e) => onChange({ period: 'custom', from: value.from, to: e.target.value })}
            className="rounded-lg border border-border-input px-2 py-1.5"
          />
        </div>
      )}
    </div>
  );
}
