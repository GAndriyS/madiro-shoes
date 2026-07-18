import {
  intakeHistoryResponseSchema,
  intakeQueueResponseSchema,
  type IntakeHistoryResponse,
  type IntakeQueueItem,
  type IntakeQueueResponse,
} from '@madiro/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IntakeEmptyQueue } from '../../components/intake/IntakeEmptyQueue';
import { IntakeHistory } from '../../components/intake/IntakeHistory';
import { IntakeQueueCard } from '../../components/intake/IntakeQueueCard';
import { NoPriceModal } from '../../components/intake/NoPriceModal';
import { PriceModal, type PriceModalTarget } from '../../components/stock/PriceModal';
import { QueryBoundary } from '@madiro/web-core';
import { api } from '@madiro/web-core';

export const Route = createFileRoute('/_app/intake')({
  component: IntakePage,
});

function IntakePage() {
  const { t } = useTranslation();
  const [historyPage, setHistoryPage] = useState(1);
  const [priceTarget, setPriceTarget] = useState<PriceModalTarget | null>(null);
  const [noPriceItem, setNoPriceItem] = useState<IntakeQueueItem | null>(null);

  const {
    data: queue,
    isPending: queuePending,
    isError: queueError,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ['intake', 'queue'],
    queryFn: async () =>
      intakeQueueResponseSchema.parse(await api.get<IntakeQueueResponse>('/intake/queue')),
  });

  const {
    data: history,
    isPending: historyPending,
    isError: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['intake', 'history', historyPage],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      intakeHistoryResponseSchema.parse(
        await api.get<IntakeHistoryResponse>(`/intake/history?page=${historyPage}`),
      ),
  });

  const subtitle =
    queue && queue.summary.variants > 0
      ? [
          t('intake.subtitlePairs', { count: queue.summary.awaitingPairs }),
          t('intake.subtitleVariants', { count: queue.summary.variants }),
          t('intake.subtitleTail'),
        ].join(' · ')
      : t('intake.subtitleEmpty');

  return (
    <div className="flex h-full flex-col gap-3 md:gap-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
        <h1 className="font-display text-[26px] font-semibold text-ink md:text-[30px]">
          {t('intake.title')}
        </h1>
        <span className="text-xs text-text-muted md:text-[13px]">{subtitle}</span>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex min-h-0 flex-col gap-2.5">
          <span className="hidden text-[11px] font-bold tracking-[1.5px] text-text-muted md:block">
            {t('intake.queueLabel')}
          </span>
          <QueryBoundary
            isPending={queuePending}
            isError={queueError}
            onRetry={() => void refetchQueue()}
          >
            {queue && queue.items.length === 0 ? (
              <IntakeEmptyQueue />
            ) : (
              <>
                {queue?.items.map((item) => (
                  <IntakeQueueCard
                    key={item.variantId}
                    item={item}
                    onSetPrice={(it) => setPriceTarget({ variantId: it.variantId })}
                    onNoPrice={(it) => setNoPriceItem(it)}
                  />
                ))}
                {queue && queue.items.length > 0 && (
                  <p className="px-0.5 text-xs leading-normal text-text-faint">
                    {t('intake.queueFootnote')}
                  </p>
                )}
              </>
            )}
          </QueryBoundary>
        </div>

        <QueryBoundary
          isPending={historyPending}
          isError={historyError}
          onRetry={() => void refetchHistory()}
        >
          {history && <IntakeHistory data={history} onPage={setHistoryPage} />}
        </QueryBoundary>
      </div>

      <PriceModal target={priceTarget} onClose={() => setPriceTarget(null)} />
      <NoPriceModal item={noPriceItem} onClose={() => setNoPriceItem(null)} />
    </div>
  );
}
