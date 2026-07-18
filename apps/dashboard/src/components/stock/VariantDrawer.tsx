import { variantDetailSchema, type VariantDetail, type VariantPair } from '@madiro/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api } from '@madiro/web-core';
import { money } from '@madiro/web-core';
import { CloseIcon, PencilIcon, TrashIcon } from '@madiro/web-core';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  SheetContent,
} from '@madiro/web-core';
import { materialSeason, pricedPurchaseLabel } from './labels';

interface Props {
  variantId: string | null;
  onClose: () => void;
  /** Price is a variant-level attribute (5 identity fields) — edited once for all pairs. */
  onEditPrice: (detail: VariantDetail) => void;
  onDeletePair: (detail: VariantDetail, pair: VariantPair) => void;
}

function shortDM(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

const DOT: Record<VariantDetail['history'][number]['type'], string> = {
  SALE: '#4a7040',
  RETURN: '#a05c3b',
  INTAKE: '#c9a53f',
  WRITEOFF: '#a05c3b',
};

function MiniKpi({
  label,
  value,
  onEdit,
  editLabel,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="relative flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-[15px] py-[13px]">
      <span className="text-[10px] font-bold tracking-[1px] text-text-muted">{label}</span>
      <span className="font-display text-[22px] font-semibold text-ink">{value}</span>
      {onEdit && (
        <button
          type="button"
          aria-label={editLabel}
          onClick={onEdit}
          className="absolute top-2.5 right-2.5 text-text-muted hover:text-ink"
        >
          <PencilIcon size={14} />
        </button>
      )}
    </div>
  );
}

/** Variant card drawer (design 2d): mini KPIs, per-pair actions, movement history. */
export function VariantDrawer({ variantId, onClose, onEditPrice, onDeletePair }: Props) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['stock', 'variant', variantId],
    enabled: variantId != null,
    queryFn: async () =>
      variantDetailSchema.parse(await api.get<VariantDetail>(`/stock/variants/${variantId}`)),
  });

  const historyLine = (h: VariantDetail['history'][number]) => {
    const sizes = h.sizes.map((s) => t('stock.sizeShort', { size: s })).join(', ');
    const typeKey = {
      SALE: 'overview.opSale',
      RETURN: 'overview.opReturn',
      INTAKE: 'overview.opIntake',
      WRITEOFF: 'overview.opWriteoff',
    }[h.type];
    const parts: string[] = [];
    if (h.type === 'INTAKE') {
      // amount 0 = deliberate no price, null = draft not yet priced
      parts.push(
        h.amount ? t('stock.historyPurchase', { price: money(h.amount) }) : t('common.noPrice'),
      );
    } else if (h.amount != null) {
      parts.push(money(h.amount));
    }
    parts.push(h.actorName);
    if (h.paymentMethod) {
      parts.push(t(h.paymentMethod === 'CASH' ? 'overview.payCash' : 'overview.payCard'));
    }
    if (h.type === 'RETURN') {
      parts.push(t('stock.historyReturn'));
    }
    return { typeKey, sizes, tail: parts.filter(Boolean).join(' · ') };
  };

  return (
    <Dialog open={variantId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {data && (
          <>
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <DialogTitle className="font-display text-[30px] font-semibold text-ink">
                  {data.style} · {t('stock.colorLabel')} {data.color}
                </DialogTitle>
                <DialogDescription className="text-[13px] text-text-muted">
                  {t('stock.variantSubtitle', {
                    materials: materialSeason(t, data.material, data.season),
                    count: data.pairs.length,
                  })}
                </DialogDescription>
              </div>
              <DialogClose className="text-text-muted hover:text-ink">
                <CloseIcon size={22} />
              </DialogClose>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <MiniKpi
                label={t('stock.kpiPurchase')}
                value={
                  data.purchasePrice != null ? pricedPurchaseLabel(t, data.purchasePrice) : '—'
                }
                onEdit={() => onEditPrice(data)}
                editLabel={t('stock.priceTitle')}
              />
              <MiniKpi
                label={t('stock.kpiLastSale')}
                value={data.lastSalePrice != null ? money(data.lastSalePrice) : '—'}
              />
              <MiniKpi
                label={t('stock.kpiSold30')}
                value={t('overview.pairs', { count: data.soldLast30Days })}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
                {t('stock.pairsInStock')}
              </span>
              <div className="rounded-xl border border-border bg-surface px-[18px] py-1">
                {data.pairs.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between py-[11px] ${
                      i < data.pairs.length - 1 ? 'border-b border-border-row' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
                      {t('stock.sizeShort', { size: p.size })}
                      {p.awaitingPrice && (
                        <span className="rounded-md bg-amber-bg px-2 py-0.5 text-[10.5px] font-bold text-amber-text">
                          {t('stock.awaitingBadge')}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-text-muted">
                      {t('stock.inStockSince', { date: shortDM(p.intakeDate) })}
                    </span>
                    <button
                      type="button"
                      aria-label={t('stock.deleteConfirm')}
                      onClick={() => onDeletePair(data, p)}
                      className="text-danger"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
                {t('stock.historyTitle')}
              </span>
              <div className="flex flex-col text-[12.5px] text-text">
                {data.history.map((h, i) => {
                  const line = historyLine(h);
                  return (
                    <div
                      key={h.id}
                      className={`flex gap-3 py-[9px] ${
                        i < data.history.length - 1 ? 'border-b border-border' : ''
                      }`}
                    >
                      <span className="w-16 flex-none text-text-muted">{shortDM(h.date)}</span>
                      <span
                        className="mt-1 h-[9px] w-[9px] flex-none rounded-full"
                        style={{ backgroundColor: DOT[h.type] }}
                      />
                      <span className="flex-1">
                        <strong className={h.type === 'RETURN' ? 'text-danger' : undefined}>
                          {t(line.typeKey)}
                        </strong>{' '}
                        {line.sizes}
                        {line.tail && ` — ${line.tail}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Dialog>
  );
}
