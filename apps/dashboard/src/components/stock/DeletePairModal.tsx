import type { VariantDetail, VariantPair } from '@madiro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';

import { api } from '../../lib/api';
import { TrashIcon } from '../layout/icons';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { materialSeason, pricedPurchaseLabel } from './labels';

export interface DeleteTarget {
  variant: Pick<VariantDetail, 'style' | 'color' | 'material' | 'season' | 'purchasePrice'>;
  pair: VariantPair;
}

interface Props {
  target: DeleteTarget | null;
  onClose: () => void;
}

/** Irreversible pair deletion confirmation (design 2h). */
export function DeletePairModal({ target, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => api.delete(`/stock/pairs/${target?.pair.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
  });

  if (target == null) {
    return null;
  }
  const { variant, pair } = target;
  const since = new Date(pair.intakeDate).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[420px] gap-4">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-danger-bg text-danger">
          <TrashIcon size={20} />
        </div>
        <DialogTitle className="font-display text-[26px] font-semibold text-ink">
          {t('stock.deleteTitle')}
        </DialogTitle>
        <DialogDescription className="text-[13.5px] leading-[1.55] text-text">
          {t('stock.deleteBody')}{' '}
          <Trans>
            <strong>{t('stock.deleteIrreversible')}</strong>
          </Trans>
        </DialogDescription>
        <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-[13px] font-bold text-ink">
            {variant.style} · {variant.color} · р. {pair.size}
          </span>
          <span className="text-[11px] text-text-muted">
            {materialSeason(t, variant.material, variant.season)} ·{' '}
            {t('stock.inStockSince', { date: since })}
            {variant.purchasePrice != null &&
              ` · ${t('stock.colPurchase').toLowerCase()} ${pricedPurchaseLabel(t, variant.purchasePrice)}`}
          </span>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 rounded-xl bg-danger p-3.5 text-center text-[14.5px] font-bold text-white disabled:opacity-60"
          >
            {t('stock.deleteConfirm')}
          </button>
          <DialogClose className="flex-1 rounded-xl border-[1.5px] border-border-input p-3.5 text-center text-[14.5px] font-semibold text-text-secondary">
            {t('stock.cancel')}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
