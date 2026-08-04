import { cn } from '@madiro/web-core';

import { clampQty, type SizeQuantities } from '../../lib/sizeGrid';

interface SizeGridProps {
  label: string;
  /** Sizes to show, already ordered — see `gridSizes`. */
  sizes: number[];
  quantities: SizeQuantities;
  onChange: (next: SizeQuantities) => void;
  /** Running total, rendered beside the label (e.g. «Всього 4 пари»). */
  summary: string;
}

/**
 * Sizes of one variant with how many pairs of each are arriving. The scanned
 * size comes in prefilled with 1; the rest are empty and typed by hand, which
 * is the whole point — a delivery is a run of sizes, not the single size the
 * box label happened to show.
 *
 * The `<label>` wraps the size number, so it becomes each input's accessible
 * name for free — no aria-label to translate and keep in sync.
 */
export function SizeGrid({ label, sizes, quantities, onChange, summary }: SizeGridProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="size-grid">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">{label}</span>
        <span
          data-testid="size-grid-total"
          className="text-[12.5px] font-semibold text-accent-hover"
        >
          {summary}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {sizes.map((size) => {
          const value = quantities[size] ?? '';
          const filled = Number(value) > 0;
          return (
            <label
              key={size}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl border-[1.5px] bg-surface px-2 py-2',
                filled ? 'border-ink' : 'border-border-input',
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-bold tracking-[1.2px]',
                  filled ? 'text-ink' : 'text-text-muted',
                )}
              >
                {size}
              </span>
              <input
                data-testid={`size-qty-${size}`}
                inputMode="numeric"
                value={value}
                placeholder="0"
                onChange={(e) => onChange({ ...quantities, [size]: clampQty(e.target.value) })}
                className="w-full bg-transparent text-center font-display text-[22px] font-semibold text-ink outline-none placeholder:text-text-faint"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
