import { describe, expect, it } from 'vitest';

import { currentMonthKey, monthLabel, shiftMonth } from '../src/lib/months';

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
