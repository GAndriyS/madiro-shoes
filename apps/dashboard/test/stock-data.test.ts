import { describe, expect, it } from 'vitest';

import { deletePair, getVariantDetail, queryStock, setVariantPrice } from '../src/mocks/stock-data';

const base = { sort: 'style-asc' as const, page: 1 };

describe('stock mock dataset', () => {
  it('містить 57 моделей і рахує підсумки', () => {
    const res = queryStock(base);
    expect(res.summary.variantsTotal).toBe(57);
    expect(res.summary.pairsTotal).toBeGreaterThan(57);
    expect(res.pageSize).toBe(8);
    expect(res.items).toHaveLength(8);
  });

  it('фільтрує за пошуком по style', () => {
    const res = queryStock({ ...base, search: '7645' });
    expect(res.total).toBe(2);
    expect(res.items.every((r) => r.style === '7645')).toBe(true);
  });

  it('фільтр «Очікують ціни» показує лише варіанти з чернетками', () => {
    const res = queryStock({ ...base, awaitingPrice: true });
    expect(res.total).toBeGreaterThan(0);
    expect(res.items.every((r) => r.awaitingPriceCount > 0)).toBe(true);
  });

  it('сортування за style у зворотному порядку', () => {
    const res = queryStock({ ...base, sort: 'style-desc' });
    const styles = res.items.map((r) => r.style);
    expect([...styles].sort().reverse()).toEqual(styles);
  });

  it('вказання ціни знімає статус «очікує ціни» з пар варіанта', () => {
    const before = queryStock({ ...base, search: '5211' }).items[0]!;
    expect(before.purchasePrice).toBeNull();
    expect(before.awaitingPriceCount).toBe(2);

    expect(setVariantPrice(before.id, 1250)).toBe(true);

    const after = queryStock({ ...base, search: '5211' }).items[0]!;
    expect(after.purchasePrice).toBe(1250);
    expect(after.awaitingPriceCount).toBe(0);
    expect(after.sizes).toEqual([36, 37]);
  });

  it('видалення пари прибирає її зі складу', () => {
    const detail = getVariantDetail(queryStock({ ...base, search: '9031' }).items[0]!.id)!;
    expect(detail.pairs).toHaveLength(1);

    expect(deletePair(detail.pairs[0]!.id)).toBe(true);

    // The variant no longer has pairs, so it disappears from the list
    expect(queryStock({ ...base, search: '9031' }).total).toBe(0);
  });

  it('деталі варіанта містять історію, відсортовану від нових до старих', () => {
    const row = queryStock({ ...base, search: '6310' }).items[0]!;
    const detail = getVariantDetail(row.id)!;
    const dates = detail.history.map((h) => h.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
