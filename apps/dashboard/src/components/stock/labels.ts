import type { Material, Season } from '@madiro/shared';
import type { TFunction } from 'i18next';

import { money } from '../../lib/format';

/**
 * Purchase price display for a non-null value: 0 = deliberate «Без ціни» (old
 * stock), a positive value = the amount. `null` (not yet priced) is handled by
 * callers, since it renders as a «вказати» action in the stock table.
 */
export function pricedPurchaseLabel(t: TFunction, value: number): string {
  return value === 0 ? t('stock.noPriceLabel') : money(value);
}

export function materialLabel(t: TFunction, material: Material | null): string | null {
  if (material == null) {
    return null;
  }
  return material === 'LEATHER' ? t('stock.materialLeather') : t('stock.materialSuede');
}

export function seasonLabel(t: TFunction, season: Season | null): string | null {
  if (season == null) {
    return null;
  }
  const map = {
    NONE: 'stock.seasonNone',
    BAIKA: 'stock.seasonBaika',
    SHEEPSKIN: 'stock.seasonSheepskin',
  } as const;
  return t(map[season]);
}

/** «Замша · байка» / «Шкіра» / «—» composite label. */
export function materialSeason(
  t: TFunction,
  material: Material | null,
  season: Season | null,
): string {
  const parts = [materialLabel(t, material), seasonLabel(t, season)].filter(
    (x): x is string => x != null,
  );
  return parts.length > 0 ? parts.join(' · ') : '—';
}
