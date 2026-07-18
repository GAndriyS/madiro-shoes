import { SIZE_MAX, SIZE_MIN, type Material, type Season } from '@madiro/shared';
import { useTranslation } from 'react-i18next';

import { cn } from '@madiro/web-core';

export interface StockFilterState {
  material?: Material;
  season?: Season;
  awaitingPrice?: boolean;
  lowStock?: boolean;
  size?: number;
}

interface Props {
  value: StockFilterState;
  queueVariants: number;
  onChange: (value: StockFilterState) => void;
}

function Chip({
  active,
  amber = false,
  onClick,
  children,
}: {
  active: boolean;
  amber?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-none rounded-[18px] border-[1.5px] px-[15px] py-[7px] text-[12.5px]',
        active
          ? 'border-ink bg-ink font-bold text-page'
          : 'border-border-input text-text-secondary',
        amber && !active && 'border-amber-border font-bold text-amber-text',
        amber && active && 'border-amber-border bg-amber-bg font-bold text-amber-text',
      )}
    >
      {children}
    </button>
  );
}

/** Filter chips row (design 2a): materials, insulation, queue, low stock, size. */
export function StockFilters({ value, queueVariants, onChange }: Props) {
  const { t } = useTranslation();
  const isAll =
    !value.material &&
    !value.season &&
    !value.awaitingPrice &&
    !value.lowStock &&
    value.size == null;

  const toggleMaterial = (m: Material) =>
    onChange({ ...value, material: value.material === m ? undefined : m });
  const toggleSeason = (s: Season) =>
    onChange({ ...value, season: value.season === s ? undefined : s });

  return (
    <div className="flex gap-2 overflow-x-auto text-[12.5px] md:flex-wrap">
      <Chip active={isAll} onClick={() => onChange({})}>
        {t('stock.filterAll')}
      </Chip>
      <Chip active={value.material === 'LEATHER'} onClick={() => toggleMaterial('LEATHER')}>
        {t('stock.filterLeather')}
      </Chip>
      <Chip active={value.material === 'SUEDE'} onClick={() => toggleMaterial('SUEDE')}>
        {t('stock.filterSuede')}
      </Chip>
      <Chip active={value.season === 'SHEEPSKIN'} onClick={() => toggleSeason('SHEEPSKIN')}>
        {t('stock.filterSheepskin')}
      </Chip>
      <Chip active={value.season === 'BAIKA'} onClick={() => toggleSeason('BAIKA')}>
        {t('stock.filterBaika')}
      </Chip>
      <Chip active={value.season === 'NONE'} onClick={() => toggleSeason('NONE')}>
        {t('stock.filterNoSeason')}
      </Chip>
      <Chip
        amber
        active={value.awaitingPrice === true}
        onClick={() =>
          onChange({ ...value, awaitingPrice: value.awaitingPrice ? undefined : true })
        }
      >
        {t('stock.filterAwaiting', { count: queueVariants })}
      </Chip>
      <Chip
        active={value.lowStock === true}
        onClick={() => onChange({ ...value, lowStock: value.lowStock ? undefined : true })}
      >
        {t('stock.filterLowStock')}
      </Chip>
      <select
        value={value.size ?? ''}
        onChange={(e) =>
          onChange({ ...value, size: e.target.value ? Number(e.target.value) : undefined })
        }
        className={cn(
          'flex-none rounded-[18px] border-[1.5px] bg-transparent px-[15px] py-[7px] text-[12.5px]',
          value.size != null
            ? 'border-ink bg-ink font-bold text-page'
            : 'border-border-input text-text-secondary',
        )}
      >
        <option value="">{t('stock.filterSize')} ▾</option>
        {Array.from({ length: SIZE_MAX - SIZE_MIN + 1 }, (_, i) => SIZE_MIN + i).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
