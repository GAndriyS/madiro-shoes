import type { OverviewResponse } from '@madiro/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { cn, money } from '@madiro/web-core';

/** «+12%» / «−4%»: the sign is part of the value, never part of the sentence. */
function signed(pct: number): string {
  return pct > 0 ? `+${pct}` : String(pct);
}

function Card({
  label,
  shortLabel,
  value,
  sub,
  subOnMobile = false,
  note,
  testId,
}: {
  label: string;
  shortLabel?: string;
  value: string;
  sub?: string | null;
  subOnMobile?: boolean;
  /** A line shown at every width — what the value leaves out. */
  note?: { text: string; testId: string } | null;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-4 py-3.5 md:px-5 md:py-[18px]"
    >
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
      {note && (
        <span data-testid={note.testId} className="text-[10px] text-text-muted md:text-[11.5px]">
          {note.text}
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
  // FR-B-05: what the margin could not be computed over — sales still awaiting
  // a price or «без ціни». Without this line a small margin on a busy day reads
  // as a bad day rather than as unpriced stock.
  const { soldWithoutBasis } = data;
  const withoutBasisNote =
    soldWithoutBasis.pairs !== 0 || soldWithoutBasis.revenue !== 0
      ? {
          testId: 'kpi-margin-without-basis',
          text: t('overview.kpiMarginWithoutBasis', {
            pairs: t('overview.pairs', { count: soldWithoutBasis.pairs }),
            revenue: money(soldWithoutBasis.revenue),
          }),
        }
      : null;

  return (
    <div className="grid grid-cols-2 gap-2.5 md:gap-3.5 lg:grid-cols-4">
      <div
        data-testid="kpi-revenue"
        className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-4 py-3.5 md:px-5 md:py-[18px]"
      >
        <span className="text-[10px] font-bold tracking-[1px] text-text-muted md:text-[11px]">
          {t('overview.kpiRevenue')}
        </span>
        <span className="font-display text-2xl font-semibold text-ink md:text-[32px]">
          {money(data.revenue)}
        </span>
        {data.revenueDeltaPct != null && (
          <span
            data-testid="kpi-revenue-delta"
            className={cn(
              'hidden text-[11.5px] md:block',
              data.revenueDeltaPct < 0 ? 'text-danger' : 'text-success',
            )}
          >
            {/* The sign belongs to the number: a template that hardcodes «+»
                renders a drop as «+-100%», in green. */}
            {t('overview.kpiRevenueDelta', { pct: signed(data.revenueDeltaPct) })}
          </span>
        )}
      </div>

      <Card
        testId="kpi-sold"
        label={t('overview.kpiSold')}
        value={t('overview.sales', { count: data.sales })}
        sub={soldSub}
        subOnMobile
      />
      <Card
        testId="kpi-margin"
        label={isToday ? t('overview.kpiMargin') : t('overview.kpiMarginShort')}
        shortLabel={t('overview.kpiMarginShort')}
        value={money(data.margin)}
        sub={
          data.marginPctOfRevenue != null
            ? t('overview.kpiMarginPct', { pct: data.marginPctOfRevenue })
            : null
        }
        note={withoutBasisNote}
      />

      {/* Dark accent card — links to the intake queue (FR-D-02) */}
      <Link
        data-testid="kpi-awaiting"
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
