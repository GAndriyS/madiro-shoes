import {
  INTAKE_GRID_MAX,
  INTAKE_GRID_MIN,
  MAX_PAIRS_PER_SIZE,
  SIZE_MAX,
  SIZE_MIN,
  type IntakeSizeQty,
} from '@madiro/shared';

/**
 * Quantity typed into each size cell, keyed by size and kept as the raw string
 * the input holds. A cleared cell has to stay cleared while the seller types
 * the next digit, which a number cannot express — 0 and "" would collapse into
 * the same value and the field would fight the person filling it.
 */
export type SizeQuantities = Record<number, string>;

/**
 * Sizes the grid shows. The 35–41 default is what this store receives; a
 * scanned size outside it is added in sorted position rather than dropped,
 * because the alternative is a seller staring at a 42 on the label with
 * nowhere on the screen to put it.
 */
export function gridSizes(recognizedSize?: number | null): number[] {
  const sizes: number[] = [];
  for (let size = INTAKE_GRID_MIN; size <= INTAKE_GRID_MAX; size += 1) sizes.push(size);

  if (
    recognizedSize == null ||
    !Number.isInteger(recognizedSize) ||
    recognizedSize < SIZE_MIN ||
    recognizedSize > SIZE_MAX ||
    sizes.includes(recognizedSize)
  ) {
    return sizes;
  }

  return [...sizes, recognizedSize].sort((a, b) => a - b);
}

/**
 * Starting quantities: 1 in the scanned size, everything else empty. Manual
 * entry passes nothing and starts fully empty — same grid, no assumptions.
 *
 * A scanned size the grid would not otherwise show is still prefilled, because
 * `gridSizes` has just made room for it.
 */
export function initialQuantities(recognizedSize?: number | null): SizeQuantities {
  const sizes = gridSizes(recognizedSize);
  if (recognizedSize == null || !sizes.includes(recognizedSize)) return {};
  return { [recognizedSize]: '1' };
}

/** Keystroke sanitiser: digits only, capped, and "" stays "" so the cell can be cleared. */
export function clampQty(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (digits === '') return '';
  return String(Math.min(Number(digits), MAX_PAIRS_PER_SIZE));
}

/**
 * The grid as the payload `POST /intake` expects: sizes with a real quantity,
 * in ascending size order. Empty and `0` cells are dropped rather than sent —
 * an untouched size is not part of this delivery.
 */
export function collectSizes(quantities: SizeQuantities): IntakeSizeQty[] {
  return Object.entries(quantities)
    .map(([size, qty]) => ({ size: Number(size), qty: Number(qty) }))
    .filter(({ qty }) => Number.isInteger(qty) && qty > 0)
    .sort((a, b) => a.size - b.size);
}

/** How many pairs the current grid would create — drives the button and the toast. */
export function totalPairs(quantities: SizeQuantities): number {
  return collectSizes(quantities).reduce((sum, { qty }) => sum + qty, 0);
}
