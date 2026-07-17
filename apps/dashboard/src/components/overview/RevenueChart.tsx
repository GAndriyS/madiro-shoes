import type { OverviewPeriod, OverviewResponse } from '@madiro/shared';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { money, shortDay } from '../../lib/format';

type Series = OverviewResponse['revenueSeries'];

const TITLE_KEY: Record<OverviewPeriod, string> = {
  today: 'overview.chartTitleToday',
  week: 'overview.chartTitleWeek',
  month: 'overview.chartTitleMonth',
  custom: 'overview.chartTitleCustom',
};

function pointLabel(iso: string, granularity: Series['granularity']): string {
  if (granularity === 'hour') {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  }
  return shortDay(iso);
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** Revenue bar chart for the selected period: #e3d9c8 bars, today accented. */
export function RevenueChart({ series, period }: { series: Series; period: OverviewPeriod }) {
  const { t } = useTranslation();
  const { granularity, points } = series;
  const total = points.reduce((sum, p) => sum + p.revenue, 0);
  const first = points[0];
  const middle = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];
  // Accent the last bar when the period ends today
  const accentLast = last != null && (granularity === 'hour' || isToday(last.date));

  return (
    <div className="hidden flex-col gap-3.5 rounded-[14px] border border-border bg-surface px-[22px] py-5 md:flex">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-extrabold text-ink">
          {t(TITLE_KEY[period])}
          {period === 'custom' && first && last && (
            <span className="font-semibold text-text-muted">
              {' '}
              ({pointLabel(first.date, granularity)} — {pointLabel(last.date, granularity)})
            </span>
          )}
        </span>
        <span className="text-[11.5px] text-text-muted">
          {t('overview.chartTotal', { sum: money(total) })}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <BarChart
            data={points}
            barCategoryGap={points.length > 40 ? '8%' : '18%'}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <Tooltip
              cursor={{ fill: 'rgba(43,38,32,.05)' }}
              content={({ active, payload }) => {
                const item = payload?.[0]?.payload as Series['points'][number] | undefined;
                if (!active || !item) {
                  return null;
                }
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-login">
                    <div className="text-text-muted">{pointLabel(item.date, granularity)}</div>
                    <div className="font-bold text-ink">{money(item.revenue)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="revenue" radius={[5, 5, 0, 0]} isAnimationActive={false}>
              {points.map((p, i) => (
                <Cell
                  key={p.date}
                  fill={accentLast && i === points.length - 1 ? '#8a6d4b' : '#e3d9c8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between text-[10.5px] text-text-faint">
        <span>{first ? pointLabel(first.date, granularity) : ''}</span>
        <span>{middle ? pointLabel(middle.date, granularity) : ''}</span>
        <span>{last ? pointLabel(last.date, granularity) : ''}</span>
      </div>
    </div>
  );
}
