import { cn } from '@madiro/web-core';

/** Editable numeric tag field (SIZE / COLOR / STYLE) — shared by intake & sale. */
interface FieldCardProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function FieldCard({ label, value, onChange }: FieldCardProps) {
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

/** Single-select pill row (season / material / payment) — shared by intake & sale. */
interface PillGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: T | null;
  optionLabel: (option: T) => string;
  onSelect: (option: T) => void;
}

export function PillGroup<T extends string>({
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
