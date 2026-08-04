import { describe, expect, it } from 'vitest';

import {
  clampQty,
  collectSizes,
  gridSizes,
  initialQuantities,
  totalPairs,
} from '../src/lib/sizeGrid';

// The grid replaced the single SIZE field, so it is now the ONLY way a size
// reaches the server from an intake — everything the old field guaranteed
// (a valid size, exactly the size that was scanned) has to hold here instead.
describe('gridSizes', () => {
  it('за замовчуванням — суцільний діапазон 35–41', () => {
    expect(gridSizes()).toEqual([35, 36, 37, 38, 39, 40, 41]);
  });

  it('розпізнаний розмір усередині діапазону нічого не додає', () => {
    expect(gridSizes(38)).toEqual([35, 36, 37, 38, 39, 40, 41]);
  });

  it('розпізнаний розмір поза діапазоном додається у відсортовану позицію', () => {
    expect(gridSizes(42)).toEqual([35, 36, 37, 38, 39, 40, 41, 42]);
    expect(gridSizes(34)).toEqual([34, 35, 36, 37, 38, 39, 40, 41]);
  });

  // A misread that lands outside 16–50 is not a size; showing it would invite
  // taking in a pair the server would reject as an unexplained 400.
  it('нереальний розмір ігнорується, сітка лишається типовою', () => {
    expect(gridSizes(99)).toEqual([35, 36, 37, 38, 39, 40, 41]);
    expect(gridSizes(0)).toEqual([35, 36, 37, 38, 39, 40, 41]);
    expect(gridSizes(38.5)).toEqual([35, 36, 37, 38, 39, 40, 41]);
    expect(gridSizes(null)).toEqual([35, 36, 37, 38, 39, 40, 41]);
  });
});

describe('initialQuantities', () => {
  it('ставить 1 у розпізнаний розмір і лишає решту порожніми', () => {
    expect(initialQuantities(38)).toEqual({ 38: '1' });
  });

  it('розпізнаний розмір поза діапазоном теж отримує свою одиницю', () => {
    expect(initialQuantities(42)).toEqual({ 42: '1' });
  });

  it('ручний ввід (без розпізнавання) починається повністю порожнім', () => {
    expect(initialQuantities()).toEqual({});
    expect(initialQuantities(null)).toEqual({});
  });

  it('нереальний розмір нічого не префілить', () => {
    expect(initialQuantities(99)).toEqual({});
  });
});

describe('clampQty', () => {
  it('лишає тільки цифри', () => {
    expect(clampQty('2шт')).toBe('2');
    expect(clampQty('-3')).toBe('3');
  });

  // Clearing a cell must survive: "" and 0 are the same intake, but only ""
  // lets the seller type the next digit without fighting the field.
  it('порожнє лишається порожнім', () => {
    expect(clampQty('')).toBe('');
    expect(clampQty('абв')).toBe('');
  });

  it('обрізає до стелі 99 і прибирає провідні нулі', () => {
    expect(clampQty('250')).toBe('99');
    expect(clampQty('007')).toBe('7');
    expect(clampQty('0')).toBe('0');
  });
});

describe('collectSizes / totalPairs', () => {
  it('віддає лише заповнені розміри, за зростанням', () => {
    expect(collectSizes({ 40: '2', 36: '1', 38: '' })).toEqual([
      { size: 36, qty: 1 },
      { size: 40, qty: 2 },
    ]);
  });

  // An untouched size is not part of this delivery; sending qty 0 would make
  // the server reject the whole batch over a cell nobody filled in.
  it('нулі та порожні комірки не потрапляють у payload', () => {
    expect(collectSizes({ 37: '0', 38: '' })).toEqual([]);
    expect(totalPairs({ 37: '0', 38: '' })).toBe(0);
  });

  it('сумує кількості, а не розміри', () => {
    expect(totalPairs({ 36: '2', 37: '1', 41: '3' })).toBe(6);
  });
});
