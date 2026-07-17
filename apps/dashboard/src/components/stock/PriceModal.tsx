import {
  setVariantPriceSchema,
  variantDetailSchema,
  type VariantDetail,
  type VariantPair,
} from '@madiro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../../lib/api';
import { dayLabel } from '../../lib/format';
import { CloseIcon } from '../layout/icons';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { materialSeason } from './labels';

export interface PriceModalTarget {
  variantId: string;
  /** Set when opened from a pair's edit action (design 2e); otherwise queue mode (2f). */
  pair?: VariantPair;
}

interface Props {
  target: PriceModalTarget | null;
  onClose: () => void;
}

function shortDM(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

/** Purchase-price modal — one price for the whole variant (designs 2e and 2f). */
export function PriceModal({ target, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');

  const { data } = useQuery({
    queryKey: ['stock', 'variant', target?.variantId],
    enabled: target != null,
    queryFn: async () =>
      variantDetailSchema.parse(
        await api.get<VariantDetail>(`/stock/variants/${target?.variantId}`),
      ),
  });

  useEffect(() => {
    setValue(data?.purchasePrice != null ? String(data.purchasePrice) : '');
  }, [data?.purchasePrice, target?.variantId]);

  const mutation = useMutation({
    mutationFn: async (purchasePrice: number) => {
      const body = setVariantPriceSchema.parse({ purchasePrice });
      return api.patch(`/stock/variants/${target?.variantId}/price`, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
  });

  if (target == null) {
    return null;
  }

  const isEditPair = target.pair != null;
  const queued = data?.pairs.filter((p) => p.awaitingPrice) ?? [];
  const draftIntake = data?.history.find((h) => h.type === 'INTAKE' && h.amount == null);
  const parsedValue = Number(value);
  const valid = Number.isFinite(parsedValue) && parsedValue > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <DialogTitle className="font-display text-[26px] font-semibold text-ink">
              {isEditPair ? t('stock.editPairTitle') : t('stock.priceTitle')}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-text-muted">
              {isEditPair && data
                ? t('stock.editPairSubtitle', {
                    pair: `${data.style} · ${data.color} · р. ${target.pair?.size}`,
                    date: target.pair ? shortDM(target.pair.intakeDate) : '',
                  })
                : draftIntake
                  ? t('stock.priceDraftFrom', {
                      name: draftIntake.actorName,
                      date: dayLabel(draftIntake.date),
                    })
                  : ''}
            </DialogDescription>
          </div>
          <DialogClose className="text-text-muted hover:text-ink">
            <CloseIcon size={20} />
          </DialogClose>
        </div>

        {data && (
          <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-[18px] py-4">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[22px] font-semibold text-ink">
                {data.style} · {t('stock.colorLabel')} {data.color}
              </span>
              <span className="text-xs text-text-muted">
                {materialSeason(t, data.material, data.season)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {isEditPair ? (
                <>
                  <span className="rounded-[7px] bg-border-row px-2.5 py-[3px] text-xs font-bold text-text-secondary">
                    р. {target.pair?.size}
                  </span>
                  <span className="text-xs text-text-muted">
                    {t('stock.inStockSince', {
                      date: target.pair ? shortDM(target.pair.intakeDate) : '',
                    })}{' '}
                    · {t('stock.variantFieldsReadonly')}
                  </span>
                </>
              ) : (
                <>
                  {queued.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-[7px] bg-amber-bg px-2.5 py-[3px] text-xs font-bold text-amber-text"
                    >
                      р. {p.size}
                    </span>
                  ))}
                  <span className="text-xs text-text-muted">
                    {t('stock.priceQueue', { count: queued.length })}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
            {t('stock.priceLabel')}
          </span>
          <label className="flex items-baseline gap-2 rounded-[14px] border-[1.5px] border-ink bg-surface px-[18px] py-4 focus-within:border-accent">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              autoFocus
              className="w-full bg-transparent font-display text-4xl font-semibold text-ink outline-none"
            />
            <span className="text-base text-text-muted">₴</span>
          </label>
          <span className="text-[11.5px] text-text-faint">
            {isEditPair && data
              ? t('stock.priceAppliesToAll', { variant: `${data.style} · ${data.color}` })
              : t('stock.priceAutofillNote')}
          </span>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate(parsedValue)}
            className={`flex-1 rounded-xl p-3.5 text-center text-[14.5px] font-bold disabled:opacity-60 ${
              isEditPair ? 'bg-ink text-page' : 'bg-accent text-white'
            }`}
          >
            {isEditPair ? t('stock.saveChanges') : t('stock.saveAndStock')}
          </button>
          <DialogClose className="rounded-xl border-[1.5px] border-border-input px-5 py-3.5 text-center text-[14.5px] font-semibold text-text-secondary">
            {t('stock.cancel')}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
