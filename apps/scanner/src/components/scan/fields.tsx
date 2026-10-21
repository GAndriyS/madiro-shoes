import type { Material, Season } from '@madiro/shared';
import { cn } from '@madiro/web-core';
import { useTranslation } from 'react-i18next';

/** Editable numeric tag field (SIZE / COLOR / STYLE) — shared by intake & sale. */
interface FieldCardProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Stable hook for tests; the label is translated, this is not. */
  testId?: string;
}

export function FieldCard({ label, value, onChange, testId }: FieldCardProps) {
  return (
    <label className="flex flex-col gap-1 rounded-xl border-[1.5px] border-border-input bg-surface px-3.5 py-3">
      <span className="text-[10px] font-bold tracking-[1.2px] text-text-muted">{label}</span>
      <input
        data-testid={testId}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className="w-full bg-transparent font-display text-[26px] font-semibold text-ink outline-none"
      />
    </label>
  );
}

/** Single-select pill row (season / material / payment) — shared by intake & sale. */
interface PillGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: T | null;
  optionLabel: (option: T) => string;
  onSelect: (option: T) => void;
  /**
   * Stable hook for tests. Each pill becomes `${testId}-${option}` — the option
   * is the enum value (`BAIKA`, `LEATHER`), so the selector survives both
   * translation and copy edits.
   */
  testId?: string;
}

export function PillGroup<T extends string>({
  label,
  options,
  selected,
  optionLabel,
  onSelect,
  testId,
}: PillGroupProps<T>) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="text-[11px] font-bold tracking-[1.5px] text-text-muted">{label}</div>
      <div className="flex gap-2">
        {options.map((option) => {
          const active = option === selected;
          return (
            <button
              key={option}
              data-testid={testId ? `${testId}-${option}` : undefined}
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
 * One in-stock material/season combination under the scanned tag — shared by
 * sale & return. Each value carries its own name: a bare «Без» left sellers
 * guessing what was missing.
 */
interface ComboPillProps {
  material: Material | null;
  season: Season;
  active: boolean;
  onClick: () => void;
  testId?: string;
}

export function ComboPill({ material, season, active, onClick, testId }: ComboPillProps) {
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
  const name = (key: string) => <span className="font-normal opacity-70">{t(key)}:</span>;

  return (
    <button
      data-testid={testId}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-[20px] border-[1.5px] px-3.5 py-2 text-[13px]',
        active
          ? 'border-ink bg-ink font-semibold text-page'
          : 'border-border-input text-text-secondary',
      )}
    >
      {/* Intake no longer asks for a material — the colour code carries it — so
          on new stock it is always empty and «не вказано» would be noise. */}
      {material && (
        <>
          {name('sale.comboMaterial')} {materialLabels[material].toLowerCase()}
          {' · '}
        </>
      )}
      {name('sale.comboSeason')} {seasonLabels[season].toLowerCase()}
    </button>
  );
}
