import {
  stockListResponseSchema,
  type StockListResponse,
  type StockVariantRow,
  type VariantDetail,
  type VariantPair,
} from '@madiro/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SearchIcon } from '../../components/layout/icons';
import { DeletePairModal, type DeleteTarget } from '../../components/stock/DeletePairModal';
import { PriceModal, type PriceModalTarget } from '../../components/stock/PriceModal';
import { StockCardsMobile } from '../../components/stock/StockCardsMobile';
import { StockEmptyState } from '../../components/stock/StockEmptyState';
import { StockFilters, type StockFilterState } from '../../components/stock/StockFilters';
import { StockPagination } from '../../components/stock/StockPagination';
import { StockTable, type StockSort } from '../../components/stock/StockTable';
import { VariantDrawer } from '../../components/stock/VariantDrawer';
import { api } from '../../lib/api';
import { money } from '../../lib/format';

export const Route = createFileRoute('/_app/stock')({
  component: StockPage,
});

function StockPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<StockFilterState>({});
  const [sort, setSort] = useState<StockSort>('style-asc');
  const [page, setPage] = useState(1);

  const [drawerVariantId, setDrawerVariantId] = useState<string | null>(null);
  const [priceTarget, setPriceTarget] = useState<PriceModalTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters, sort]);

  const { data } = useQuery({
    queryKey: ['stock', 'list', { search: debouncedSearch, filters, sort, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({ sort, page: String(page) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.material) params.set('material', filters.material);
      if (filters.season) params.set('season', filters.season);
      if (filters.awaitingPrice) params.set('awaitingPrice', 'true');
      if (filters.lowStock) params.set('lowStock', 'true');
      if (filters.size != null) params.set('size', String(filters.size));
      return stockListResponseSchema.parse(
        await api.get<StockListResponse>(`/stock/variants?${params}`),
      );
    },
  });

  const resetAll = () => {
    setSearch('');
    setFilters({});
  };

  const openEditPair = (detail: VariantDetail, pair: VariantPair) =>
    setPriceTarget({ variantId: detail.id, pair });
  const openDeletePair = (detail: VariantDetail, pair: VariantPair) =>
    setDeleteTarget({ variant: detail, pair });

  return (
    <div className="flex h-full flex-col gap-3 md:gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex items-baseline justify-between gap-4 md:justify-start">
          <h1 className="font-display text-[26px] font-semibold text-ink md:text-[30px]">
            {t('stock.title')}
          </h1>
          {data && (
            <span className="text-xs text-text-muted md:text-[13px]">
              <span className="hidden lg:inline">
                {t('stock.summary', {
                  pairs: data.summary.pairsTotal,
                  variants: data.summary.variantsTotal,
                  value: money(data.summary.purchaseValue),
                })}
              </span>
              <span className="lg:hidden">
                {t('stock.summaryShort', {
                  pairs: data.summary.pairsTotal,
                  variants: data.summary.variantsTotal,
                })}
              </span>
            </span>
          )}
        </div>
        <label className="flex items-center gap-2.5 rounded-[11px] border-[1.5px] border-border-input bg-surface px-4 py-2.5 focus-within:border-ink md:w-60">
          <SearchIcon size={15} className="flex-none text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('stock.searchPlaceholder')}
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-text-faint"
          />
        </label>
      </div>

      <StockFilters
        value={filters}
        queueVariants={data?.queueVariants ?? 0}
        onChange={setFilters}
      />

      {data && data.items.length === 0 ? (
        <div className="flex flex-1 flex-col rounded-[14px] border border-border bg-surface">
          <StockEmptyState query={debouncedSearch} onReset={resetAll} />
        </div>
      ) : (
        <>
          <div className="hidden flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-surface md:flex">
            <StockTable
              rows={data?.items ?? []}
              sort={sort}
              onSortToggle={() => setSort((s) => (s === 'style-asc' ? 'style-desc' : 'style-asc'))}
              onRowClick={(row) => setDrawerVariantId(row.id)}
              onSetPrice={(row) => setPriceTarget({ variantId: row.id })}
              onEdit={(row) => setPriceTarget({ variantId: row.id })}
              onDelete={(row) => setDrawerVariantId(row.id)}
            />
            {data && (
              <div className="mt-auto">
                <StockPagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  shown={data.items.length}
                  onPage={setPage}
                />
              </div>
            )}
          </div>

          <div className="md:hidden">
            <StockCardsMobile
              rows={data?.items ?? []}
              onRowClick={(row: StockVariantRow) => setDrawerVariantId(row.id)}
            />
            {data && (
              <div className="mt-2 rounded-[14px] border border-border bg-surface">
                <StockPagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  shown={data.items.length}
                  onPage={setPage}
                />
              </div>
            )}
          </div>
        </>
      )}

      <VariantDrawer
        variantId={drawerVariantId}
        onClose={() => setDrawerVariantId(null)}
        onEditPair={openEditPair}
        onDeletePair={openDeletePair}
      />
      <PriceModal target={priceTarget} onClose={() => setPriceTarget(null)} />
      <DeletePairModal target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}
