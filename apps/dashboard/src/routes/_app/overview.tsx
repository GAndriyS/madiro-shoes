import { overviewResponseSchema, type OverviewResponse } from '@madiro/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { KpiCards } from '../../components/overview/KpiCards';
import { OperationsFeed } from '../../components/overview/OperationsFeed';
import { PeriodSwitcher, type PeriodValue } from '../../components/overview/PeriodSwitcher';
import { QueueWidget } from '../../components/overview/QueueWidget';
import { RevenueChart } from '../../components/overview/RevenueChart';
import { api } from '../../lib/api';
import { titleDate } from '../../lib/format';

export const Route = createFileRoute('/_app/overview')({
  component: OverviewPage,
});

function OverviewPage() {
  const { t, i18n } = useTranslation();
  const [periodValue, setPeriodValue] = useState<PeriodValue>({ period: 'today' });

  const { data } = useQuery({
    queryKey: ['stats', 'overview', periodValue],
    queryFn: async () => {
      const params = new URLSearchParams({ period: periodValue.period });
      if (periodValue.from) params.set('from', periodValue.from);
      if (periodValue.to) params.set('to', periodValue.to);
      return overviewResponseSchema.parse(
        await api.get<OverviewResponse>(`/stats/overview?${params}`),
      );
    },
  });

  return (
    <div className="flex h-full flex-col gap-3 md:gap-[22px]">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-[26px] font-semibold text-ink md:text-[30px]">
          {t('overview.title')} ·{' '}
          <span className="hidden md:inline">{titleDate(i18n.language, true)}</span>
          <span className="md:hidden">{titleDate(i18n.language, false)}</span>
        </h1>
        <PeriodSwitcher value={periodValue} onChange={setPeriodValue} />
      </div>

      {data && (
        <>
          <KpiCards data={data} isToday={periodValue.period === 'today'} />
          <div className="grid min-h-0 flex-1 gap-3 md:gap-3.5 lg:grid-cols-[1.5fr_1fr]">
            <RevenueChart series={data.revenueSeries} period={periodValue.period} />
            <QueueWidget items={data.queue} />
          </div>
          <OperationsFeed items={data.recentOperations} />
        </>
      )}
    </div>
  );
}
