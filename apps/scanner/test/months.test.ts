import { describe, expect, it } from 'vitest';

import {
  currentMonthKey,
  dayKeyOf,
  dayKeyShort,
  groupByDay,
  monthLabel,
  shiftMonth,
} from '../src/lib/months';

describe('currentMonthKey', () => {
  it('бере місяць за годинником магазину, а не за часом пристрою', () => {
    // 2026-01-01 00:30 у Києві — це ще 31 грудня за UTC.
    expect(currentMonthKey(new Date('2025-12-31T22:30:00.000Z'))).toBe('2026-01');
  });

  it('літній час: 2026-07-31 23:30 за Києвом — усе ще липень', () => {
    expect(currentMonthKey(new Date('2026-07-31T20:30:00.000Z'))).toBe('2026-07');
  });
});

describe('shiftMonth', () => {
  it('крокує в межах року', () => {
    expect(shiftMonth('2026-07', -1)).toBe('2026-06');
    expect(shiftMonth('2026-07', 1)).toBe('2026-08');
  });

  it('перекочується через межу року в обидва боки', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('крок більший за рік', () => {
    expect(shiftMonth('2026-07', -12)).toBe('2025-07');
  });
});

describe('dayKeyOf / groupByDay (S-6, FR-S-17)', () => {
  it('день рахується за годинником магазину, а не за UTC', () => {
    // 2026-07-29 22:30 UTC — у Києві вже 30 липня.
    expect(dayKeyOf('2026-07-29T22:30:00.000Z')).toBe('2026-07-30');
  });

  it('операції у два дні дають дві групи, порядок збережено', () => {
    const rows = [
      { id: 'a', at: '2026-07-30T08:00:00.000Z' },
      { id: 'b', at: '2026-07-30T10:00:00.000Z' },
      { id: 'c', at: '2026-07-29T12:00:00.000Z' },
    ];
    const groups = groupByDay(rows, (r) => r.at);
    expect(groups.map((g) => g.day)).toEqual(['2026-07-30', '2026-07-29']);
    expect(groups[0]!.items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups[1]!.items.map((r) => r.id)).toEqual(['c']);
  });

  it('межа дня за Києвом розрізає групу правильно', () => {
    const rows = [
      { id: 'late', at: '2026-07-29T21:30:00.000Z' }, // 30.07 00:30 у Києві
      { id: 'early', at: '2026-07-29T20:30:00.000Z' }, // 29.07 23:30 у Києві
    ];
    const groups = groupByDay(rows, (r) => r.at);
    expect(groups.map((g) => g.day)).toEqual(['2026-07-30', '2026-07-29']);
  });

  it('dayKeyShort: «12.07» з ключа дня', () => {
    expect(dayKeyShort('2026-07-12')).toBe('12.07');
  });
});

describe('monthLabel', () => {
  it('українська назва місяця з великої літери', () => {
    expect(monthLabel('2026-07', 'uk')).toBe('Липень 2026');
  });

  it('англійська локаль', () => {
    expect(monthLabel('2026-07', 'en')).toBe('July 2026');
  });

  // Formatting must not shift the month backwards through the timezone.
  it('січень не з’їжджає в грудень', () => {
    expect(monthLabel('2026-01', 'en')).toBe('January 2026');
  });
});
