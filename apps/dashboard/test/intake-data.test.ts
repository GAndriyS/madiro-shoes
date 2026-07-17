import { describe, expect, it } from 'vitest';

import {
  queryIntakeHistory,
  queryIntakeQueue,
  setVariantNoPrice,
  setVariantPrice,
} from '../src/mocks/stock-data';

describe('intake mock dataset', () => {
  it('черга містить 3 варіанти й 5 пар, що очікують ціни', () => {
    const res = queryIntakeQueue();
    expect(res.summary.variants).toBe(3);
    expect(res.summary.awaitingPairs).toBe(5);
    expect(res.items).toHaveLength(3);
  });

  it('показує кейс «продана до ціни» з ціною продажу', () => {
    const res = queryIntakeQueue();
    const sold = res.items.flatMap((it) => it.sizes).find((s) => s.sold);
    expect(sold?.soldPrice).toBe(4100);
  });

  it('підказує минулу ціну поступлення варіанта', () => {
    const item = queryIntakeQueue().items.find((it) => it.style === '8102' && it.color === '07');
    expect(item?.lastPurchasePrice).toBe(1800);
  });

  it('«без ціни» прибирає варіант із черги, лишаючи його в історії без ціни', () => {
    const before = queryIntakeQueue().items.find((it) => it.style === '6310' && it.color === '22');
    expect(before).toBeDefined();

    expect(setVariantNoPrice(before!.variantId)).toBe(true);

    expect(queryIntakeQueue().items.some((it) => it.variantId === before!.variantId)).toBe(false);
    const inHistory = queryIntakeHistory(1);
    const all = Array.from({ length: inHistory.total }, (_, i) => i);
    expect(all.length).toBeGreaterThan(0);
  });

  it('вказання ціни прибирає варіант із черги й додає в історію з ціною', () => {
    const target = queryIntakeQueue().items.find((it) => it.style === '5211');
    expect(target).toBeDefined();

    expect(setVariantPrice(target!.variantId, 1250)).toBe(true);

    expect(queryIntakeQueue().items.some((it) => it.variantId === target!.variantId)).toBe(false);
    const entry = queryIntakeHistory(1).items.find(
      (e) => e.style === '5211' && e.purchasePrice === 1250,
    );
    expect(entry).toBeDefined();
  });

  it('історія відсортована від нових до старих і пагінується', () => {
    const res = queryIntakeHistory(1);
    expect(res.pageSize).toBe(6);
    const dates = res.items.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
