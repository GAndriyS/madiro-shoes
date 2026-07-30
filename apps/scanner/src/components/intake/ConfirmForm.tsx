import {
  MATERIALS,
  SEASONS,
  type IntakeInput,
  type Material,
  type Season,
  type TagRecognition,
} from '@madiro/shared';
import { AlertIcon, ChevronRightIcon, cn, useAuthStore } from '@madiro/web-core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePriceHint } from '../../lib/usePriceHint';
import { FieldCard, PillGroup } from '../scan/fields';

/** Recognitions below this read as "double-check me" in the UI (heuristic). */
const LOW_CONFIDENCE_THRESHOLD = 0.8;

export type SaveMode = 'next' | 'finish';

interface ConfirmFormProps {
  /** Absent in manual entry — the form starts empty, no confidence banner. */
  recognition?: TagRecognition;
  saving: boolean;
  onSave: (input: IntakeInput, mode: SaveMode) => void;
  onRescan: () => void;
  onBack: () => void;
}

/**
 * Prefilled intake confirmation (design 3a). An admin sets a purchase price or
 * marks the pair "no price — old stock"; a seller sees a note and saves a draft
 * that enters the awaiting-price queue. Both roles can save-and-scan-next
 * (batch) or save-and-finish.
 */
export function ConfirmForm({ recognition, saving, onSave, onRescan, onBack }: ConfirmFormProps) {
  const { t } = useTranslation();
  const isAdmin = useAuthStore((s) => s.user?.role) === 'ADMIN';
  const [size, setSize] = useState(recognition ? String(recognition.size) : '');
  const [color, setColor] = useState(recognition?.color ?? '');
  const [style, setStyle] = useState(recognition?.style ?? '');
  const [season, setSeason] = useState<Season>('NONE');
  const [material, setMaterial] = useState<Material | null>(null);
  const [priceMode, setPriceMode] = useState<'set' | 'none'>('set');
  const [price, setPrice] = useState('');
  // Once the admin types, the hint stops writing into the field — a suggestion
  // must never overwrite what a person has just entered.
  const [priceTouched, setPriceTouched] = useState(false);

  const hint = usePriceHint(isAdmin ? { style, color, material, season } : null);

  useEffect(() => {
    if (priceTouched) return;
    // The identity changed and the new variant has no hint: clear the field.
    // Leaving the previous variant's price here would let a batch be received
    // at a price that belongs to a different model (S-4).
    if (hint == null) {
      setPrice('');
      setPriceMode('set');
      return;
    }
    setPrice(hint > 0 ? String(hint) : '');
    // A variant confirmed as «без ціни — старий товар» (0) arrives here as the
    // same decision, pre-selected rather than silently turned into an empty field.
    setPriceMode(hint === 0 ? 'none' : 'set');
  }, [hint, priceTouched]);

  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };
  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };

  const priceValue = Number(price);
  const priceEntered = price.length > 0 && priceValue > 0;
  // Same size bounds as the checkout flows — manual entry must not discover
  // them as an unexplained 400 from the server.
  const sizeNum = Number(size);
  const sizeValid = Number.isInteger(sizeNum) && sizeNum >= 16 && sizeNum <= 50;
  // Admin must decide: a price or the explicit "no price" toggle.
  const canSave = sizeValid && color.length > 0 && style.length > 0 && !saving;
  const adminNeedsPrice = isAdmin && priceMode === 'set' && !priceEntered;

  const submit = (mode: SaveMode) => {
    if (!canSave || adminNeedsPrice) return;
    // «Без ціни — старий товар» is the price 0, exactly what the dashboard's
    // no-price action writes — not null, which would mean «ще не вказана» and
    // leave the pair looking like a draft nobody had priced yet.
    const purchasePrice = isAdmin ? (priceMode === 'none' ? 0 : priceValue) : undefined;
    onSave(
      {
        size: sizeNum,
        color,
        style,
        ...(material ? { material } : {}),
        season,
        ...(purchasePrice !== undefined ? { purchasePrice } : {}),
      },
      mode,
    );
  };

  return (
    <div data-testid="intake-form" className="flex flex-1 flex-col gap-[13px] px-5 pt-4 pb-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label={t('common.back')}
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary"
          >
            <ChevronRightIcon size={16} className="rotate-180" />
          </button>
          <div className="text-[15px] font-bold text-ink">{t('intake.confirmTitle')}</div>
        </div>
        <span className="rounded-lg bg-segment px-2.5 py-[5px] text-[11px] font-bold tracking-[1px] text-accent-hover">
          {isAdmin ? t('intake.badgeAdmin') : t('intake.badgeSeller')}
        </span>
      </div>

      {recognition != null && recognition.confidence < LOW_CONFIDENCE_THRESHOLD && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-border bg-amber-bg px-4 py-3">
          <AlertIcon size={18} className="flex-none text-amber-text" />
          <div className="text-[12.5px] leading-snug text-amber-text">
            {t('intake.lowConfidenceHint')}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <FieldCard
          testId="field-size"
          label={t('intake.fieldSize')}
          value={size}
          onChange={setSize}
        />
        <FieldCard
          testId="field-color"
          label={t('intake.fieldColor')}
          value={color}
          onChange={setColor}
        />
        <FieldCard
          testId="field-style"
          label={t('intake.fieldStyle')}
          value={style}
          onChange={setStyle}
        />
      </div>

      <PillGroup
        testId="season"
        label={t('intake.seasonLabel')}
        options={SEASONS}
        selected={season}
        optionLabel={(option) => seasonLabels[option]}
        onSelect={setSeason}
      />
      <PillGroup
        testId="material"
        label={t('intake.materialLabel')}
        options={MATERIALS}
        selected={material}
        optionLabel={(option) => materialLabels[option]}
        onSelect={(option) => setMaterial((current) => (current === option ? null : option))}
      />

      {isAdmin ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('intake.priceLabel')}
            </span>
            <button
              data-testid="no-price-toggle"
              type="button"
              onClick={() => {
                setPriceTouched(true);
                setPriceMode((m) => (m === 'set' ? 'none' : 'set'));
              }}
              className="text-[12.5px] font-semibold text-accent-hover"
            >
              {priceMode === 'set' ? t('intake.noPriceToggle') : t('intake.withPriceToggle')}
            </button>
          </div>
          {priceMode === 'set' ? (
            <div className="flex items-baseline gap-2 rounded-[14px] border-[1.5px] border-ink bg-surface px-[18px] py-4">
              <input
                data-testid="purchase-price-input"
                inputMode="numeric"
                value={price}
                placeholder={t('intake.pricePlaceholder')}
                onChange={(e) => {
                  setPriceTouched(true);
                  setPrice(e.target.value.replace(/\D/g, ''));
                }}
                className="w-full bg-transparent font-display text-[34px] font-semibold text-ink outline-none placeholder:text-text-faint"
              />
              <span className="text-base text-text-muted">₴</span>
            </div>
          ) : (
            <div className="rounded-[14px] border-[1.5px] border-dashed border-border-input bg-surface px-[18px] py-4 text-[13px] text-text-secondary">
              {t('common.noPrice')}
            </div>
          )}
          {/* Say where the number came from, so a suggestion never reads as a fact. */}
          {hint != null && !priceTouched && (
            <span data-testid="price-hint-note" className="text-[11.5px] text-text-muted">
              {t('intake.priceHintNote')}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-input bg-row-selected px-4 py-3.5">
          <AlertIcon size={20} className="flex-none text-accent" />
          <div className="text-[12.5px] leading-snug text-accent-hover">
            {t('intake.sellerDraftNote')}
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        <button
          data-testid="intake-save-next"
          type="button"
          disabled={!canSave || adminNeedsPrice}
          onClick={() => submit('next')}
          className={cn(
            'rounded-[14px] p-[17px] text-center text-base font-bold disabled:opacity-50',
            isAdmin ? 'bg-accent text-white' : 'bg-ink text-page',
          )}
        >
          {isAdmin ? t('intake.saveAndNextAdmin') : t('intake.saveAndNextSeller')}
        </button>
        <button
          data-testid="intake-save-finish"
          type="button"
          disabled={!canSave || adminNeedsPrice}
          onClick={() => submit('finish')}
          className="p-1 text-center text-[13px] font-semibold text-text-secondary disabled:opacity-50"
        >
          {t('intake.saveAndFinish')}
        </button>
        <button
          type="button"
          onClick={onRescan}
          className="p-1 text-center text-[13px] font-semibold text-text-faint"
        >
          {t('intake.rescan')}
        </button>
      </div>
    </div>
  );
}
