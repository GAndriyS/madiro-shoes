import type { IntakeQueueItem } from '@madiro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api } from '../../lib/api';
import { AlertIcon } from '../layout/icons';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { materialSeason } from '../stock/labels';

interface Props {
  item: IntakeQueueItem | null;
  onClose: () => void;
}

/** "Leave without a purchase price?" confirmation (design 3e). */
export function NoPriceModal({ item, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => api.post(`/stock/variants/${item?.variantId}/no-price`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intake'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
  });

  if (item == null) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[440px] gap-4">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-amber-bg text-amber-text">
          <AlertIcon size={20} />
        </div>
        <DialogTitle className="font-display text-[26px] font-semibold text-ink">
          {t('intake.noPriceTitle')}
        </DialogTitle>
        <DialogDescription className="text-[13.5px] leading-[1.55] text-text">
          {t('intake.noPriceBody')}
        </DialogDescription>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-[13px] font-bold text-ink">
            {item.style} · {item.color} · {materialSeason(t, item.material, item.season)}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {item.sizes.map((s) => (
              <span
                key={s.pairId}
                className="rounded-md bg-amber-bg px-[9px] py-0.5 text-[11.5px] font-bold text-amber-text"
              >
                {t('intake.sizeShort', { size: s.size })}
              </span>
            ))}
            <span className="text-[11px] text-text-muted">
              {t('overview.pairs', { count: item.sizes.length })} ·{' '}
              {t('intake.noPriceDraftFrom', { name: item.sellerName })}
            </span>
          </div>
        </div>
        {mutation.isError && <p className="text-[13px] text-danger">{t('common.actionError')}</p>}
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 rounded-xl bg-accent p-3.5 text-center text-[14.5px] font-bold text-white disabled:opacity-60"
          >
            {t('intake.noPriceConfirm')}
          </button>
          <DialogClose className="flex-1 rounded-xl border-[1.5px] border-border-input p-3.5 text-center text-[14.5px] font-semibold text-text-secondary">
            {t('intake.cancel', { defaultValue: t('stock.cancel') })}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
