import type { OverviewResponse } from '@madiro/shared';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { money } from '../../lib/format';

function shortDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** Бар-чарт виручки за 14 днів (дизайн 1a): бари #e3d9c8, сьогодні — акцент. */
export function RevenueChart({ days }: { days: OverviewResponse['revenueByDay'] }) {
  const { t } = useTranslation();
  const total = days.reduce((sum, d) => sum + d.revenue, 0);
  const first = days[0];
  const middle = days[Math.floor(days.length / 2)];
  const last = days[days.length - 1];

  return (
    <div className="hidden flex-col gap-3.5 rounded-[14px] border border-border bg-surface px-[22px] py-5 md:flex">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-extrabold text-ink">{t('overview.chartTitle')}</span>
        <span className="text-[11.5px] text-text-muted">
          {t('overview.chartTotal', { sum: money(total) })}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <BarChart
            data={days}
            barCategoryGap="18%"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <Tooltip
              cursor={{ fill: 'rgba(43,38,32,.05)' }}
              content={({ active, payload }) => {
                const item = payload?.[0]?.payload as
                  OverviewResponse['revenueByDay'][number] | undefined;
                if (!active || !item) {
                  return null;
                }
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-login">
                    <div className="text-text-muted">{shortDate(item.date)}</div>
                    <div className="font-bold text-ink">{money(item.revenue)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="revenue" radius={[5, 5, 0, 0]} isAnimationActive={false}>
              {days.map((d, i) => (
                <Cell key={d.date} fill={i === days.length - 1 ? '#8a6d4b' : '#e3d9c8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between text-[10.5px] text-text-faint">
        <span>{first ? shortDate(first.date) : ''}</span>
        <span>{middle ? shortDate(middle.date) : ''}</span>
        <span>{last ? shortDate(last.date) : ''}</span>
      </div>
    </div>
  );
}
