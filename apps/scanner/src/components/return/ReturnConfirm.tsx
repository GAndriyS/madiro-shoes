import {
  RETURN_GUIDELINE_DAYS,
  type Material,
  type ReturnLookupResponse,
  type Season,
} from '@madiro/shared';
import { AlertIcon, ChevronRightIcon, money, timeOf } from '@madiro/web-core';
import { useTranslation } from 'react-i18next';

import { FieldCard } from '../scan/fields';

interface ReturnConfirmProps {
  size: string;
  color: string;
  style: string;
  onFieldChange: (field: 'size' | 'color' | 'style', value: string) => void;
  lookup: ReturnLookupResponse | undefined;
  loading: boolean;
  saving: boolean;
  onConfirm: (operationId: string) => void;
  onRescan: () => void;
  onBack: () => void;
}

/**
 * Return confirmation (FR-S-14): the last sale of the scanned pair with the
 * «Продано … днів тому · оплата · продавець» line, the 14-day guideline hint
 * (advisory, never blocking) and the destructive-toned confirm CTA.
 */
export function ReturnConfirm({
  size,
  color,
  style,
  onFieldChange,
  lookup,
  loading,
  saving,
  onConfirm,
  onRescan,
  onBack,
}: ReturnConfirmProps) {
  const { t, i18n } = useTranslation();

  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };
  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };

  const sale = lookup?.sale ?? null;
  const fieldsValid = size.length > 0 && color.length > 0 && style.length > 0;
  const notFound = !loading && fieldsValid && lookup != null && sale == null;

  const soldLine = () => {
    if (!sale) return '';
    const date = new Date(sale.soldAt).toLocaleDateString(
      i18n.language === 'uk' ? 'uk-UA' : 'en-GB',
      { day: '2-digit', month: '2-digit' },
    );
    const ago =
      sale.daysSince === 0 ? t('return.today') : t('return.daysAgo', { count: sale.daysSince });
    const payment =
      sale.paymentMethod === 'CARD'
        ? t('sale.paymentCard').toLowerCase()
        : sale.paymentMethod === 'CASH'
          ? t('sale.paymentCash').toLowerCase()
          : null;
    return [`${t('return.soldWord')} ${date} — ${ago}`, payment, sale.sellerName]
      .filter(Boolean)
      .join(' · ');
  };

  const traits = sale
    ? [
        sale.material ? materialLabels[sale.material] : null,
        sale.season && sale.season !== 'NONE' ? seasonLabels[sale.season].toLowerCase() : null,
      ].filter((p): p is string => p != null)
    : [];

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
        <div className="text-[15px] font-bold text-ink">{t('return.confirmTitle')}</div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <FieldCard
          label={t('intake.fieldSize')}
          value={size}
          onChange={(v) => onFieldChange('size', v)}
        />
        <FieldCard
          label={t('intake.fieldColor')}
          value={color}
          onChange={(v) => onFieldChange('color', v)}
        />
        <FieldCard
          label={t('intake.fieldStyle')}
          value={style}
          onChange={(v) => onFieldChange('style', v)}
        />
      </div>

      {sale && (
        <>
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-4 py-3.5">
            <span className="font-display text-[22px] font-semibold text-ink">
              {sale.style} · {t('sale.colorWord')} {sale.color} · р. {sale.size}
            </span>
            {traits.length > 0 && (
              <span className="text-[12.5px] text-text-muted">{traits.join(' · ')}</span>
            )}
            <span className="text-[12.5px] text-text-secondary">
              {soldLine()} · {timeOf(sale.soldAt)}
            </span>
            <span className="font-display text-[26px] font-semibold text-ink">
              {money(sale.salePrice)}
            </span>
          </div>

          {sale.daysSince > RETURN_GUIDELINE_DAYS && (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-border bg-amber-bg px-4 py-3">
              <AlertIcon size={18} className="flex-none text-amber-text" />
              <span className="text-[12.5px] leading-snug text-amber-text">
                {t('return.guidelineOver', { limit: RETURN_GUIDELINE_DAYS })}
              </span>
            </div>
          )}

          <div className="text-center text-[12.5px] leading-relaxed text-text-muted">
            {t('return.note')}
          </div>
        </>
      )}

      {notFound && (
        <div className="flex items-start gap-3 rounded-xl border border-[#d4a08a] bg-[#f5e5dc] px-4 py-3.5">
          <AlertIcon size={20} className="mt-0.5 flex-none text-[#a05c3b]" />
          <div className="flex flex-col gap-1">
            <span className="text-[13.5px] font-bold text-[#a05c3b]">
              {t('return.notFoundTitle')}
            </span>
            <span className="text-[12.5px] leading-snug text-[#a05c3b]">
              {t('return.notFoundBody', { style, color, size })}
            </span>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        {sale && (
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => onConfirm(sale.operationId)}
            className="rounded-[14px] bg-[#a05c3b] p-[17px] text-center text-base font-bold text-white disabled:opacity-50"
          >
            {t('return.cta', { amount: money(-sale.salePrice) })}
          </button>
        )}
        <button
          type="button"
          onClick={onRescan}
          className="p-1 text-center text-[13px] font-semibold text-text-secondary"
        >
          {t('return.rescan')}
        </button>
      </div>
    </div>
  );
}
