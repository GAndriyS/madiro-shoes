import type { StockVariantRow } from '@madiro/shared';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';
import { money } from '../../lib/format';
import { PencilIcon, TrashIcon } from '../layout/icons';
import { materialSeason } from './labels';

export type StockSort = 'style-asc' | 'style-desc';

interface Props {
  rows: StockVariantRow[];
  sort: StockSort;
  onSortToggle: () => void;
  onRowClick: (row: StockVariantRow) => void;
  onSetPrice: (row: StockVariantRow) => void;
  onEdit: (row: StockVariantRow) => void;
  onDelete: (row: StockVariantRow) => void;
}

// Grid templates: desktop (>=1100) full 8 columns, tablet (768-1100) compact 5
const GRID =
  'grid items-center gap-2 px-[18px] md:max-lg:grid-cols-[90px_70px_1.3fr_70px_100px] lg:grid-cols-[100px_80px_1fr_1.5fr_80px_110px_120px_90px] lg:px-[22px]';
const TABLET_HIDDEN = 'md:max-lg:hidden';

function SizeChips({ row }: { row: StockVariantRow }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-[5px]">
      {row.sizes.map((s) => (
        <span
          key={s}
          className="rounded-md border border-border-input px-2 py-0.5 text-xs tabular-nums"
        >
          {s}
        </span>
      ))}
      {row.awaitingPriceCount > 0 && (
        <span className="rounded-md bg-amber-bg px-2 py-0.5 text-[11px] font-bold text-amber-text">
          {t('stock.awaitingChip', { count: row.awaitingPriceCount })}
        </span>
      )}
    </span>
  );
}

/** Stock table (design 2a/2b) — TanStack Table with manual server-side sort/pagination. */
export function StockTable({
  rows,
  sort,
  onSortToggle,
  onRowClick,
  onSetPrice,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const columnHelper = createColumnHelper<StockVariantRow>();

  const columns = useMemo(
    () => [
      columnHelper.accessor('style', {
        id: 'style',
        header: () => (
          <button type="button" onClick={onSortToggle} className="text-left font-extrabold">
            {t('stock.colStyle')} {sort === 'style-asc' ? '↓' : '↑'}
          </button>
        ),
        cell: (info) => (
          <span className="flex flex-col">
            <span className="font-extrabold text-ink">{info.getValue()}</span>
            <span className="hidden text-[11px] font-normal text-text-muted md:max-lg:block">
              {materialSeason(t, info.row.original.material, info.row.original.season)}
            </span>
          </span>
        ),
      }),
      columnHelper.accessor('color', {
        id: 'color',
        header: () => t('stock.colColor'),
        cell: (info) => info.getValue(),
      }),
      columnHelper.display({
        id: 'material',
        header: () => t('stock.colMaterial'),
        cell: (info) => materialSeason(t, info.row.original.material, info.row.original.season),
        meta: { className: TABLET_HIDDEN },
      }),
      columnHelper.display({
        id: 'sizes',
        header: () => t('stock.colSizes'),
        cell: (info) => <SizeChips row={info.row.original} />,
      }),
      columnHelper.accessor('pairsCount', {
        id: 'pairs',
        header: () => <span className="block text-right">{t('stock.colPairs')}</span>,
        cell: (info) => (
          <span className={cn('block text-right font-bold', info.getValue() <= 1 && 'text-danger')}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('purchasePrice', {
        id: 'purchase',
        header: () => <span className="block text-right">{t('stock.colPurchase')}</span>,
        cell: (info) =>
          info.getValue() == null ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetPrice(info.row.original);
              }}
              className="block w-full text-right font-bold text-amber-text"
            >
              {t('stock.setPrice')}
            </button>
          ) : (
            <span className="block text-right">{money(info.getValue()!)}</span>
          ),
      }),
      columnHelper.accessor('lastSalePrice', {
        id: 'lastSale',
        header: () => <span className="block text-right">{t('stock.colLastSale')}</span>,
        cell: (info) => (
          <span className="block text-right">
            {info.getValue() == null ? (
              <span className="text-text-faint">—</span>
            ) : (
              money(info.getValue()!)
            )}
          </span>
        ),
        meta: { className: TABLET_HIDDEN },
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="block text-right">{t('stock.colActions')}</span>,
        cell: (info) => (
          <span className="flex justify-end gap-3">
            <button
              type="button"
              aria-label={t('stock.editPairTitle')}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(info.row.original);
              }}
              className="text-text-muted hover:text-ink"
            >
              <PencilIcon size={15} />
            </button>
            <button
              type="button"
              aria-label={t('stock.deleteConfirm')}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(info.row.original);
              }}
              className="text-danger"
            >
              <TrashIcon size={15} />
            </button>
          </span>
        ),
        meta: { className: TABLET_HIDDEN },
      }),
    ],
    [columnHelper, t, sort, onSortToggle, onSetPrice, onEdit, onDelete],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  return (
    <div className="hidden flex-col md:flex">
      {table.getHeaderGroups().map((hg) => (
        <div
          key={hg.id}
          className={cn(
            GRID,
            'border-b border-border py-[13px] text-[10.5px] font-extrabold tracking-[1.2px] text-text-muted',
          )}
        >
          {hg.headers.map((h) => (
            <span
              key={h.id}
              className={(h.column.columnDef.meta as { className?: string } | undefined)?.className}
            >
              {flexRender(h.column.columnDef.header, h.getContext())}
            </span>
          ))}
        </div>
      ))}
      {table.getRowModel().rows.map((row, i, all) => (
        <div
          key={row.id}
          onClick={() => onRowClick(row.original)}
          className={cn(
            GRID,
            'cursor-pointer py-[13px] text-[13.5px] text-text tabular-nums hover:bg-row-selected/60',
            i < all.length - 1 && 'border-b border-border-row',
          )}
        >
          {row.getVisibleCells().map((cell) => (
            <span
              key={cell.id}
              className={
                (cell.column.columnDef.meta as { className?: string } | undefined)?.className
              }
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
