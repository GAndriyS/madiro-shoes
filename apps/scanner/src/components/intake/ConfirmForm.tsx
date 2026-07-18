import {
  MATERIALS,
  SEASONS,
  type Material,
  type Season,
  type TagRecognition,
} from '@madiro/shared';
import { AlertIcon, ChevronRightIcon, cn, useAuthStore } from '@madiro/web-core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Recognitions below this read as "double-check me" in the UI (heuristic). */
const LOW_CONFIDENCE_THRESHOLD = 0.8;

interface ConfirmFormProps {
  recognition: TagRecognition;
  onRescan: () => void;
  onBack: () => void;
}

interface FieldCardProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function FieldCard({ label, value, onChange }: FieldCardProps) {
  return (
    <label className="flex flex-col gap-1 rounded-xl border-[1.5px] border-border-input bg-surface px-3.5 py-3">
      <span className="text-[10px] font-bold tracking-[1.2px] text-text-muted">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className="w-full bg-transparent font-display text-[26px] font-semibold text-ink outline-none"
      />
    </label>
  );
}

interface PillGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: T | null;
  optionLabel: (option: T) => string;
  onSelect: (option: T) => void;
}

function PillGroup<T extends string>({
  label,
  options,
  selected,
  optionLabel,
  onSelect,
}: PillGroupProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">{label}</div>
      <div className="flex gap-2">
        {options.map((option) => {
          const active = option === selected;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(option)}
              className={cn(
                'rounded-[20px] border-[1.5px] px-3.5 py-2 text-[13px]',
                active
                  ? 'border-ink bg-ink font-semibold text-page'
                  : 'border-border-input text-text-secondary',
              )}
            >
              {optionLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Prefilled confirmation (design 3a): editable SIZE/COLOR/STYLE cards, season
 * and material pills. Saving is intentionally disabled — intake persistence
 * is the next PR; the form proves the recognition loop end to end.
 */
export function ConfirmForm({ recognition, onRescan, onBack }: ConfirmFormProps) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const [size, setSize] = useState(String(recognition.size));
  const [color, setColor] = useState(recognition.color);
  const [style, setStyle] = useState(recognition.style);
  const [season, setSeason] = useState<Season>('NONE');
  const [material, setMaterial] = useState<Material | null>(null);

  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };
  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };

  return (
    <div className="flex flex-1 flex-col gap-[13px] px-5 pt-4 pb-7">
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
          {role === 'ADMIN' ? t('intake.badgeAdmin') : t('intake.badgeSeller')}
        </span>
      </div>

      {recognition.confidence < LOW_CONFIDENCE_THRESHOLD && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-border bg-amber-bg px-4 py-3">
          <AlertIcon size={18} className="flex-none text-amber-text" />
          <div className="text-[12.5px] leading-snug text-amber-text">
            {t('intake.lowConfidenceHint')}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <FieldCard label={t('intake.fieldSize')} value={size} onChange={setSize} />
        <FieldCard label={t('intake.fieldColor')} value={color} onChange={setColor} />
        <FieldCard label={t('intake.fieldStyle')} value={style} onChange={setStyle} />
      </div>

      <PillGroup
        label={t('intake.seasonLabel')}
        options={SEASONS}
        selected={season}
        optionLabel={(option) => seasonLabels[option]}
        onSelect={setSeason}
      />
      <PillGroup
        label={t('intake.materialLabel')}
        options={MATERIALS}
        selected={material}
        optionLabel={(option) => materialLabels[option]}
        onSelect={(option) => setMaterial((current) => (current === option ? null : option))}
      />

      <div className="mt-auto flex flex-col gap-2.5">
        <div className="text-center text-[12px] text-text-muted">
          {t('intake.saveDisabledNote')}
        </div>
        <button
          type="button"
          disabled
          className="rounded-[14px] bg-accent p-[17px] text-center text-base font-bold text-white opacity-50"
        >
          {t('intake.save')}
        </button>
        <button
          type="button"
          onClick={onRescan}
          className="p-1 text-center text-[13px] font-semibold text-text-secondary"
        >
          {t('intake.rescan')}
        </button>
      </div>
    </div>
  );
}
