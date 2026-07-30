import {
  cancelOperationResultSchema,
  type CancelOperationResult,
  type VariantDetail,
  type VariantHistoryEntry,
} from '@madiro/shared';
import { ApiError, api, money } from '@madiro/web-core';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  UndoIcon,
} from '@madiro/web-core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export interface CancelTarget {
  variant: Pick<VariantDetail, 'id' | 'style' | 'color'>;
  entry: VariantHistoryEntry;
}

interface Props {
  target: CancelTarget | null;
  onClose: () => void;
}

/**
 * Confirmation for reversing a mistaken sale or write-off (FR-D-07, §7.2).
 * Destructive actions always state their consequences: the pair comes back to
 * stock and the operation drops out of the statistics.
 */
export function CancelOperationModal({ target, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () =>
      cancelOperationResultSchema.parse(
        await api.post<CancelOperationResult>(`/stock/operations/${target?.entry.id}/cancel`, {}),
      ),
    onSuccess: () => {
      // Stock counts, the variant drawer, the overview KPIs and the feed all move.
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      onClose();
    },
  });

  if (target == null) {
    return null;
  }
  const { variant, entry } = target;
  const isSale = entry.type === 'SALE';
  const date = new Date(entry.date).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[420px] gap-4">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-danger-bg text-danger">
          <UndoIcon size={20} />
        </div>
        <DialogTitle className="font-display text-[26px] font-semibold text-ink">
          {isSale ? t('stock.cancelSaleTitle') : t('stock.cancelWriteoffTitle')}
        </DialogTitle>
        <DialogDescription className="text-[13.5px] leading-[1.55] text-text">
          {isSale ? t('stock.cancelSaleBody') : t('stock.cancelWriteoffBody')}
        </DialogDescription>
        <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-[13px] font-bold text-ink">
            {variant.style} · {variant.color} ·{' '}
            {entry.sizes.map((size) => t('stock.sizeShort', { size })).join(', ')}
          </span>
          <span className="text-[11px] text-text-muted">
            {date} · {entry.actorName}
            {entry.amount != null && ` · ${money(entry.amount)}`}
          </span>
        </div>
        {mutation.isError && (
          <p className="text-[13px] text-danger">
            {mutation.error instanceof ApiError && mutation.error.status === 409
              ? t('stock.cancelConflict')
              : t('common.actionError')}
          </p>
        )}
        <div className="flex gap-2.5">
          <button
            data-testid="cancel-operation-confirm"
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 rounded-xl bg-danger p-3.5 text-center text-[14.5px] font-bold text-white disabled:opacity-60"
          >
            {t('stock.cancelOperationConfirm')}
          </button>
          <DialogClose className="flex-1 rounded-xl border-[1.5px] border-border-input p-3.5 text-center text-[14.5px] font-semibold text-text-secondary">
            {t('stock.cancel')}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
