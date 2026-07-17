import type { Material, Season } from '@madiro/shared';
import type { TFunction } from 'i18next';

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
