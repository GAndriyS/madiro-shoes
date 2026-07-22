import type { FoundPair, Material, PaymentMethod, Season } from '@madiro/shared';
import { ChevronRightIcon, cn, money } from '@madiro/web-core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type CheckoutPayload =
  | { kind: 'sale'; salePrice: number; paymentMethod: PaymentMethod }
  | { kind: 'writeoff'; comment?: string };

interface SaleDetailsProps {
  pair: FoundPair;
  salePriceHint: number | null;
  saving: boolean;
  onConfirm: (payload: CheckoutPayload) => void;
  onBack: () => void;
}

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}

/** Two-column segmented toggle (design 2a-2: «ТИП ВИХОДУ», «ОПЛАТА»). */
function Segmented<T extends string>({ options, selected, onSelect }: SegmentedProps<T>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(option.value)}
            className={cn(
              'rounded-xl border-[1.5px] p-3.5 text-center text-[14px]',
              active
                ? 'border-ink bg-ink font-bold text-page'
                : 'border-border-input text-text-secondary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Checkout details (design 2a-2, FR-S-07/08): found-pair card, sale/write-off
 * type toggle, sale price prefilled with the variant's last sale (rule 3.3 #9),
 * cash/card payment — or a no-price write-off with an optional comment.
 */
export function SaleDetails({ pair, salePriceHint, saving, onConfirm, onBack }: SaleDetailsProps) {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState<'SALE' | 'WRITEOFF'>('SALE');
  const [price, setPrice] = useState(salePriceHint != null ? String(salePriceHint) : '');
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [comment, setComment] = useState('');

  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };
  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };
  const traits = [
    pair.material ? materialLabels[pair.material] : null,
    pair.season && pair.season !== 'NONE' ? seasonLabels[pair.season].toLowerCase() : null,
  ].filter((p): p is string => p != null);
  const intakeDay = new Date(pair.intakeDate).toLocaleDateString(
    i18n.language === 'uk' ? 'uk-UA' : 'en-GB',
    { day: '2-digit', month: '2-digit' },
  );

  const priceValue = Number(price);
  const priceValid = price.length > 0 && priceValue > 0;
  const canConfirm = !saving && (type === 'WRITEOFF' || priceValid);

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(
      type === 'SALE'
        ? { kind: 'sale', salePrice: priceValue, paymentMethod: payment }
        : { kind: 'writeoff', ...(comment.trim() ? { comment: comment.trim() } : {}) },
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-[13px] px-5 pt-4 pb-7">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={t('common.back')}
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary"
        >
          <ChevronRightIcon size={16} className="rotate-180" />
        </button>
        <div className="text-[15px] font-bold text-ink">{t('sale.detailsTitle')}</div>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3.5">
        <span className="font-display text-[22px] font-semibold text-ink">
          {pair.style} · {t('sale.colorWord')} {pair.color} · р. {pair.size}
        </span>
        <span className="text-[12.5px] text-text-muted">
          {[...traits, t('sale.inStockSince', { date: intakeDay })].join(' · ')}
          {pair.awaitingPrice ? ` · ${t('sale.awaitingPriceBadge')}` : ''}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
          {t('sale.typeLabel')}
        </div>
        <Segmented
          options={[
            { value: 'SALE', label: t('sale.typeSale') },
            { value: 'WRITEOFF', label: t('sale.typeWriteoff') },
          ]}
          selected={type}
          onSelect={setType}
        />
      </div>

      {type === 'SALE' ? (
        <>
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('sale.priceLabel')}
            </div>
            <div className="flex items-baseline gap-2 rounded-[14px] border-[1.5px] border-ink bg-surface px-[18px] py-4">
              <input
                inputMode="numeric"
                value={price}
                placeholder={t('intake.pricePlaceholder')}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-transparent font-display text-[34px] font-semibold text-ink outline-none placeholder:text-text-faint"
              />
              <span className="text-base text-text-muted">₴</span>
            </div>
            {salePriceHint != null && (
              <div className="text-[12px] text-text-muted">{t('sale.priceHint')}</div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('sale.paymentLabel')}
            </div>
            <Segmented
              options={[
                { value: 'CASH', label: t('sale.paymentCash') },
                { value: 'CARD', label: t('sale.paymentCard') },
              ]}
              selected={payment}
              onSelect={setPayment}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('sale.commentLabel')}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="resize-none rounded-[14px] border-[1.5px] border-border-input bg-surface px-4 py-3.5 text-[14px] text-ink outline-none focus:border-ink"
            />
          </div>
          <div className="text-[12px] text-text-muted">{t('sale.writeoffNote')}</div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        <button
          type="button"
          disabled={!canConfirm}
          onClick={confirm}
          className={cn(
            'rounded-[14px] p-[17px] text-center text-base font-bold text-white disabled:opacity-50',
            type === 'SALE' ? 'bg-accent' : 'bg-[#a05c3b]',
          )}
        >
          {type === 'SALE'
            ? t('sale.confirmSale', { amount: priceValid ? money(priceValue) : '…' })
            : t('sale.confirmWriteoff')}
        </button>
      </div>
    </div>
  );
}
