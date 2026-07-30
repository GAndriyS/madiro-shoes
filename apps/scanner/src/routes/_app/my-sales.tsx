import { mySalesResponseSchema, type MySalesPeriod, type MySalesResponse } from '@madiro/shared';
import { ChevronRightIcon, QueryBoundary, api, cn, money, timeOf } from '@madiro/web-core';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  currentMonthKey,
  dayKeyOf,
  dayKeyShort,
  groupByDay,
  monthLabel,
  shiftMonth,
} from '../../lib/months';

export const Route = createFileRoute('/_app/my-sales')({
  component: MySalesPage,
});

/**
 * The seller's own sales (design 6a, FR-S-17): today / current month toggle,
 * period summary and the operations list. Informational only — no margins,
 * no bonuses, and no cancel actions (cancellation is admin-only, FR-D-07).
 */
function MySalesPage() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<MySalesPeriod>('today');
  const thisMonth = currentMonthKey();
  const [month, setMonth] = useState(thisMonth);

  const sales = useQuery({
    queryKey: ['me', 'sales', period, period === 'month' ? month : null],
    queryFn: async () =>
      mySalesResponseSchema.parse(
        await api.get<MySalesResponse>(
          period === 'month' ? `/me/sales?period=month&month=${month}` : '/me/sales?period=today',
        ),
      ),
  });

  const selectedMonthLabel = monthLabel(month, i18n.language);
  // Nothing can be sold in a month that has not started.
  const atCurrentMonth = month >= thisMonth;

  const paymentWord = (method: 'CASH' | 'CARD' | null) =>
    method === 'CARD'
      ? t('sale.paymentCard').toLowerCase()
      : method === 'CASH'
        ? t('sale.paymentCash').toLowerCase()
        : null;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-4 pb-7">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary"
        >
          <ChevronRightIcon size={16} className="rotate-180" />
        </Link>
        <h1 className="font-display text-[26px] font-semibold text-ink">{t('mySales.title')}</h1>
      </div>

      <div className="flex rounded-xl bg-segment p-1">
        {(
          [
            { value: 'today', label: t('mySales.today') },
            { value: 'month', label: selectedMonthLabel },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={period === value}
            onClick={() => {
              // Coming back to the month tab always lands on the current month,
              // so a seller cannot mistake an old month's total for today's work.
              if (value === 'month' && period !== 'month') setMonth(thisMonth);
              setPeriod(value);
            }}
            className={cn(
              'flex-1 rounded-[9px] p-[9px] text-center text-[13.5px]',
              period === value
                ? 'bg-surface font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,.06)]'
                : 'text-text-secondary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {period === 'month' && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-2 py-1.5">
          <button
            type="button"
            aria-label={t('mySales.previousMonth')}
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary"
          >
            <ChevronRightIcon size={16} className="rotate-180" />
          </button>
          <span className="text-[13.5px] font-bold text-ink">{selectedMonthLabel}</span>
          <button
            type="button"
            aria-label={t('mySales.nextMonth')}
            disabled={atCurrentMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary disabled:opacity-30"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
      )}

      <QueryBoundary
        isPending={sales.isPending}
        isError={sales.isError}
        onRetry={() => void sales.refetch()}
      >
        {sales.data && (
          <>
            <div className="flex gap-7 rounded-2xl border border-border bg-surface px-[22px] py-[18px]">
              <div className="flex flex-col">
                <span className="font-display text-[32px] font-semibold text-ink">
                  {sales.data.pairs}
                </span>
                <span className="text-[11.5px] text-text-muted">{t('mySales.pairsLabel')}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-display text-[32px] font-semibold text-ink">
                  {money(sales.data.total)}
                </span>
                <span className="text-[11.5px] text-text-muted">
                  {period === 'today' ? t('mySales.totalToday') : t('mySales.totalMonth')}
                </span>
              </div>
            </div>

            {sales.data.items.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-surface px-8 text-center text-[13.5px] leading-relaxed text-text-muted">
                {t('mySales.empty')}
              </div>
            ) : (
              <div className="flex flex-col tabular-nums">
                {/* Month view groups operations by store-timezone day (FR-S-17);
                    the today view is a single day, so headers would be noise. */}
                {(period === 'month'
                  ? groupByDay(sales.data.items, (row) => row.at)
                  : [{ day: null as string | null, items: sales.data.items }]
                ).map((group) => (
                  <div key={group.day ?? 'today'} className="flex flex-col">
                    {group.day != null && (
                      <div className="mt-3 mb-0.5 border-b border-border pb-1.5 text-[11px] font-bold tracking-[1.5px] text-text-muted uppercase first:mt-0">
                        {group.day === dayKeyOf(new Date().toISOString())
                          ? t('common.today')
                          : group.day === dayKeyOf(new Date(Date.now() - 86_400_000).toISOString())
                            ? t('common.yesterday')
                            : dayKeyShort(group.day)}
                      </div>
                    )}
                    {group.items.map((row, index) => {
                      const isReturn = row.type === 'RETURN';
                      // A write-off is informational (S-5): neutral tone, no
                      // amount — it never counts towards the period totals.
                      const isWriteoff = row.type === 'WRITEOFF';
                      const tone = isReturn
                        ? 'text-[#a05c3b]'
                        : isWriteoff
                          ? 'text-text-muted'
                          : 'text-ink';
                      const subtitle = isReturn
                        ? `${timeOf(row.at)} · ${t('mySales.returnNote')}`
                        : isWriteoff
                          ? `${timeOf(row.at)} · ${t('mySales.writeoffNote')}`
                          : [timeOf(row.at), paymentWord(row.paymentMethod)]
                              .filter(Boolean)
                              .join(' · ');
                      return (
                        <div
                          key={row.id}
                          data-testid={`my-sales-row-${row.type}`}
                          className={cn(
                            'flex items-baseline justify-between px-0.5 py-3.5',
                            index < group.items.length - 1 && 'border-b border-border',
                          )}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className={cn('text-[14.5px] font-bold', tone)}>
                              {row.style} · {row.color} · р. {row.size}
                              {isReturn ? ` — ${t('mySales.returnTag')}` : ''}
                              {isWriteoff ? ` — ${t('mySales.writeoffTag')}` : ''}
                            </span>
                            <span className="text-[11.5px] text-text-muted">{subtitle}</span>
                          </div>
                          <span className={cn('text-[15px] font-bold', tone)}>
                            {isWriteoff
                              ? '—'
                              : row.amount != null
                                ? money(row.amount)
                                : t('common.noPrice')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
