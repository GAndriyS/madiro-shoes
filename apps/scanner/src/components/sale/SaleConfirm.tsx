import type { Material, SaleCombo, SaleLookupResponse, Season } from '@madiro/shared';
import { AlertIcon, BoxIcon, CheckIcon, ChevronRightIcon, cn } from '@madiro/web-core';
import { useTranslation } from 'react-i18next';

import { FieldCard } from '../scan/fields';

export interface ComboChoice {
  material: Material | null;
  season: Season | null;
}

interface SaleConfirmProps {
  /** Screen title override (manual entry); defaults to «Підтвердження скану». */
  title?: string;
  photoUrl: string | null;
  size: string;
  color: string;
  style: string;
  onFieldChange: (field: 'size' | 'color' | 'style', value: string) => void;
  lookup: SaleLookupResponse | undefined;
  loading: boolean;
  /** Explicit narrowing choice; undefined = not narrowed yet. */
  selectedCombo: ComboChoice | undefined;
  onComboSelect: (combo: ComboChoice) => void;
  onSizeSelect: (size: number) => void;
  onNext: () => void;
  /** Absent in manual mode — hides the «Сканувати ще раз» actions. */
  onRescan?: () => void;
  onManualSearch: () => void;
  onBack: () => void;
}

const sameCombo = (a: ComboChoice, b: SaleCombo) =>
  a.material === b.material && a.season === b.season;

/**
 * Scan confirmation for checkout (design 2a-1): editable tag fields, narrowing
 * to material/season combinations actually in stock (rule 3.3 #5), available
 * sizes, and the not-found state with close matches (design 2b-1).
 */
export function SaleConfirm({
  title,
  photoUrl,
  size,
  color,
  style,
  onFieldChange,
  lookup,
  loading,
  selectedCombo,
  onComboSelect,
  onSizeSelect,
  onNext,
  onRescan,
  onManualSearch,
  onBack,
}: SaleConfirmProps) {
  const { t } = useTranslation();

  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };
  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };
  const comboLabel = (combo: SaleCombo) => {
    const parts = [
      combo.material ? materialLabels[combo.material] : null,
      combo.season ? seasonLabels[combo.season] : null,
    ].filter((p): p is string => p != null);
    return parts.length > 0 ? parts.join(' · ') : t('sale.comboNone');
  };

  const combos = lookup?.combos ?? [];
  // A single combination needs no explicit choice (the server auto-resolves it).
  const effectiveCombo: ComboChoice | undefined =
    selectedCombo ?? (combos.length === 1 ? combos[0] : undefined);
  const activeCombo = effectiveCombo ? combos.find((c) => sameCombo(effectiveCombo, c)) : undefined;
  const sizes = activeCombo
    ? activeCombo.sizes
    : [...new Set(combos.flatMap((c) => c.sizes))].sort((a, b) => a - b);

  const fieldsValid = size.length > 0 && color.length > 0 && style.length > 0;
  // Not-found is an error only once the choice is unambiguous (or empty stock).
  const notFound =
    !loading &&
    fieldsValid &&
    lookup != null &&
    lookup.pair == null &&
    (combos.length === 0 || activeCombo != null);

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
        <div className="text-[15px] font-bold text-ink">{title ?? t('sale.confirmTitle')}</div>
      </div>

      {photoUrl && (
        <div className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-2.5">
          <img
            src={photoUrl}
            alt={t('sale.photoLabel')}
            className="h-[52px] w-[84px] flex-none rounded-lg object-cover"
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-[1.2px] text-text-muted">
              {t('sale.photoLabel')}
            </span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3c5c34]">
              <CheckIcon size={13} /> {t('sale.recognized')}
            </span>
          </div>
        </div>
      )}

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

      {combos.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
            {t('sale.comboLabel')}
          </div>
          <div className="flex flex-wrap gap-2">
            {combos.map((combo) => {
              const active = effectiveCombo != null && sameCombo(effectiveCombo, combo);
              return (
                <button
                  key={`${combo.material ?? '-'}·${combo.season ?? '-'}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onComboSelect({ material: combo.material, season: combo.season })}
                  className={cn(
                    'rounded-[20px] border-[1.5px] px-3.5 py-2 text-[13px]',
                    active
                      ? 'border-ink bg-ink font-semibold text-page'
                      : 'border-border-input text-text-secondary',
                  )}
                >
                  {comboLabel(combo)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
            <BoxIcon size={16} className="text-accent-hover" /> {t('sale.availableSizes')}
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const active = String(s) === size;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSizeSelect(s)}
                  className={cn(
                    'min-w-10 rounded-[10px] border-[1.5px] px-3 py-1.5 text-[14px] font-semibold',
                    active
                      ? 'border-ink bg-ink text-page'
                      : 'border-border-input text-text-secondary',
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {notFound && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 rounded-xl border border-[#d4a08a] bg-[#f5e5dc] px-4 py-3.5">
            <AlertIcon size={20} className="mt-0.5 flex-none text-[#a05c3b]" />
            <div className="flex flex-col gap-1">
              <span className="text-[13.5px] font-bold text-[#a05c3b]">
                {t('sale.notFoundTitle')}
              </span>
              <span className="text-[12.5px] leading-snug text-[#a05c3b]">
                {t('sale.notFoundBody', { style, color, size })}
              </span>
            </div>
          </div>

          {lookup.similar.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
                {t('sale.similarLabel')}
              </div>
              <div className="flex flex-col gap-1.5">
                {lookup.similar.map((row) => (
                  <button
                    key={`${row.style}·${row.color}·${row.size}`}
                    type="button"
                    onClick={() => {
                      onFieldChange('style', row.style);
                      onFieldChange('color', row.color);
                      onFieldChange('size', String(row.size));
                    }}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left"
                  >
                    <span className="text-[13.5px] font-semibold text-ink">
                      {row.style} · {row.color} · р. {row.size}
                    </span>
                    <span className="text-[12.5px] text-text-muted">
                      {t('sale.similarCount', { count: row.count })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        {notFound ? (
          <>
            <button
              type="button"
              onClick={onManualSearch}
              className="rounded-[14px] bg-ink p-[17px] text-center text-base font-bold text-page"
            >
              {t('sale.manualSearch')}
            </button>
            {onRescan && (
              <button
                type="button"
                onClick={onRescan}
                className="p-1 text-center text-[13px] font-semibold text-text-secondary"
              >
                {t('sale.rescan')}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={loading || lookup?.pair == null}
              onClick={onNext}
              className="rounded-[14px] bg-ink p-[17px] text-center text-base font-bold text-page disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('sale.next')}
            </button>
            {onRescan && (
              <button
                type="button"
                onClick={onRescan}
                className="p-1 text-center text-[13px] font-semibold text-text-faint"
              >
                {t('sale.rescan')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
