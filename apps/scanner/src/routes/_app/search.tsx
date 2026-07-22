import {
  stockSearchResponseSchema,
  type Material,
  type Season,
  type StockSearchResponse,
} from '@madiro/shared';
import { ChevronRightIcon, QueryBoundary, SearchIcon, api } from '@madiro/web-core';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/search')({
  component: SearchPage,
});

/**
 * Reference stock search by style (FR-S-16): type the style code, see the
 * in-stock variants with per-size counts. Read-only — checkout goes through
 * the sale flow or manual entry.
 */
function SearchPage() {
  const { t } = useTranslation();
  const [style, setStyle] = useState('');
  const enabled = style.length >= 2;

  const results = useQuery({
    queryKey: ['stock', 'search', style],
    enabled,
    queryFn: async () =>
      stockSearchResponseSchema.parse(
        await api.get<StockSearchResponse>(`/sale/search?style=${style}`),
      ),
  });

  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };
  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-4 pb-7">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary"
        >
          <ChevronRightIcon size={16} className="rotate-180" />
        </Link>
        <h1 className="font-display text-[26px] font-semibold text-ink">{t('search.title')}</h1>
      </div>

      <label className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-border-input bg-surface px-4 py-3.5 focus-within:border-ink">
        <SearchIcon size={18} className="flex-none text-text-muted" strokeWidth={1.8} />
        <input
          inputMode="numeric"
          value={style}
          placeholder={t('search.placeholder')}
          onChange={(e) => setStyle(e.target.value.replace(/\D/g, ''))}
          className="w-full bg-transparent text-[17px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-text-faint"
        />
      </label>

      {!enabled ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-surface px-8 text-center text-[13.5px] leading-relaxed text-text-muted">
          {t('search.hint')}
        </div>
      ) : (
        <QueryBoundary
          isPending={results.isPending}
          isError={results.isError}
          onRetry={() => void results.refetch()}
        >
          {results.data &&
            (results.data.items.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-surface px-8 text-center text-[13.5px] leading-relaxed text-text-muted">
                {t('search.empty', { style })}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {results.data.items.map((item) => {
                  const traits = [
                    item.material ? materialLabels[item.material] : null,
                    item.season && item.season !== 'NONE'
                      ? seasonLabels[item.season].toLowerCase()
                      : null,
                  ].filter(Boolean);
                  return (
                    <div
                      key={`${item.style}·${item.color}·${item.material ?? '-'}·${item.season ?? '-'}`}
                      className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface px-[18px] py-[15px]"
                    >
                      <div className="flex flex-col gap-[3px]">
                        <span className="text-[15px] font-bold text-ink">
                          {item.style} · {t('sale.colorWord')} {item.color}
                        </span>
                        {traits.length > 0 && (
                          <span className="text-xs text-text-muted">{traits.join(' · ')}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.sizes.map(({ size, count }) => (
                          <span
                            key={size}
                            className="rounded-[10px] border-[1.5px] border-border-input px-3 py-1.5 text-[13.5px] font-semibold text-text-secondary"
                          >
                            {size}
                            {count > 1 && (
                              <span className="ml-1 text-[11px] text-text-muted">×{count}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </QueryBoundary>
      )}
    </div>
  );
}
