import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { api } from '../../lib/api';

export const Route = createFileRoute('/_app/overview')({
  component: OverviewPage,
});

interface OverviewStats {
  revenue: number;
  revenueDeltaPct: number;
  sales: number;
  returns: number;
  netPairs: number;
  margin: number;
  marginPctOfRevenue: number;
  awaitingPrice: { pairs: number; sellers: number; variants: number };
}

function OverviewPage() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.get<OverviewStats>('/stats/overview'),
  });

  return (
    <div>
      <h1 className="font-display text-[30px] font-semibold text-ink">{t('overview.title')}</h1>
      {/* Заглушка: повний екран Огляду (KPI, чарт, черга, стрічка) — наступний ПР */}
      {data && (
        <p className="mt-4 text-[13.5px] text-text-secondary">
          Виручка (мок): {data.revenue.toLocaleString('uk-UA')} ₴ · продажів {data.sales} · маржа{' '}
          {data.margin.toLocaleString('uk-UA')} ₴
        </p>
      )}
    </div>
  );
}
