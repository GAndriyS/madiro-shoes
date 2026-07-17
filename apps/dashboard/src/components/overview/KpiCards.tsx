import type { OverviewResponse } from '@madiro/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { money } from '../../lib/format';

function Card({
  label,
  shortLabel,
  value,
  sub,
  subOnMobile = false,
}: {
  label: string;
  shortLabel?: string;
  value: string;
  sub?: string | null;
  subOnMobile?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-4 py-3.5 md:px-5 md:py-[18px]">
      <span className="text-[10px] font-bold tracking-[1px] text-text-muted md:text-[11px] md:tracking-[1.2px]">
        {shortLabel ? (
          <>
            <span className="md:hidden">{shortLabel}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
      <span className="font-display text-2xl font-semibold text-ink md:text-[32px]">{value}</span>
      {sub && (
        <span
          className={`${subOnMobile ? 'block text-[10px]' : 'hidden'} text-text-muted md:block md:text-[11.5px]`}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

export function KpiCards({ data, isToday }: { data: OverviewResponse; isToday: boolean }) {
  const { t } = useTranslation();
  const soldSub = `${t('overview.returns', { count: data.returns })} · ${t('overview.netPairs', {
    count: data.netPairs,
  })}`;

  return (
    <div className="grid grid-cols-2 gap-2.5 md:gap-3.5 lg:grid-cols-4">
      <div className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-4 py-3.5 md:px-5 md:py-[18px]">
        <span className="text-[10px] font-bold tracking-[1px] text-text-muted md:text-[11px]">
          {t('overview.kpiRevenue')}
        </span>
        <span className="font-display text-2xl font-semibold text-ink md:text-[32px]">
          {money(data.revenue)}
        </span>
        {data.revenueDeltaPct != null && (
          <span className="hidden text-[11.5px] text-success md:block">
            {t('overview.kpiRevenueDelta', { pct: data.revenueDeltaPct })}
          </span>
        )}
      </div>

      <Card
        label={t('overview.kpiSold')}
        value={t('overview.sales', { count: data.sales })}
        sub={soldSub}
        subOnMobile
      />
      <Card
        label={isToday ? t('overview.kpiMargin') : t('overview.kpiMarginShort')}
        shortLabel={t('overview.kpiMarginShort')}
        value={money(data.margin)}
        sub={
          data.marginPctOfRevenue != null
            ? t('overview.kpiMarginPct', { pct: data.marginPctOfRevenue })
            : null
        }
      />

      {/* Темна акцентна картка — клік веде в чергу поступлень (FR-D-02) */}
      <Link
        to="/intake"
        className="flex flex-col gap-1 rounded-[14px] bg-ink px-4 py-3.5 md:px-5 md:py-[18px]"
      >
        <span className="text-[10px] font-bold tracking-[1px] text-sidebar-muted md:text-[11px]">
          <span className="md:hidden">{t('overview.kpiAwaitingShort')}</span>
          <span className="hidden md:inline">{t('overview.kpiAwaiting')}</span>
        </span>
        <span className="font-display text-2xl font-semibold text-queue-badge md:text-[32px]">
          {t('overview.pairs', { count: data.awaitingPrice.pairs })}
        </span>
        <span className="hidden text-[11.5px] text-sidebar-muted md:block">
          {t('overview.fromSellers', { count: data.awaitingPrice.sellers })}
        </span>
      </Link>
    </div>
  );
}
