import { describe, expect, it } from 'vitest';

import {
  usdToUah,
  adminIntakeSchema,
  intakeSchema,
  loginRequestSchema,
  OVERVIEW_MAX_RANGE_DAYS,
  overviewQuerySchema,
  SIZE_MAX,
  SIZE_MIN,
  tagRecognitionSchema,
} from '../src/index.js';

describe('tagRecognitionSchema', () => {
  const valid = { size: 38, color: '36', style: '7645', confidence: 0.93 };

  it('приймає коректний результат розпізнавання', () => {
    expect(tagRecognitionSchema.parse(valid)).toEqual(valid);
  });

  it('відхиляє дробовий розмір — розміри лише цілі', () => {
    expect(tagRecognitionSchema.safeParse({ ...valid, size: 38.5 }).success).toBe(false);
  });

  it('відхиляє розмір поза діапазоном', () => {
    expect(tagRecognitionSchema.safeParse({ ...valid, size: SIZE_MIN - 1 }).success).toBe(false);
    expect(tagRecognitionSchema.safeParse({ ...valid, size: SIZE_MAX + 1 }).success).toBe(false);
  });

  it('відхиляє нечислові коди з бірки', () => {
    expect(tagRecognitionSchema.safeParse({ ...valid, style: '76A5' }).success).toBe(false);
  });
});

describe('intakeSchema', () => {
  const base = { sizes: [{ size: 38, qty: 1 }], color: '36', style: '7645' };

  it('приймає поступлення без матеріалу, утеплення й ціни (чернетка продавця)', () => {
    expect(intakeSchema.safeParse(base).success).toBe(true);
  });

  it('приймає «ціну ще не вказано» (null)', () => {
    expect(intakeSchema.safeParse({ ...base, purchasePriceUsd: null }).success).toBe(true);
  });

  // «Без ціни — старий товар» is $0 — a decision, and a legal value here.
  it('приймає 0 як свідоме «без ціни»', () => {
    expect(intakeSchema.safeParse({ ...base, purchasePriceUsd: 0 }).success).toBe(true);
  });

  it('відхиляє від’ємну ціну закупки', () => {
    expect(intakeSchema.safeParse({ ...base, purchasePriceUsd: -100 }).success).toBe(false);
  });

  it('приймає кілька розмірів з кількостями', () => {
    const many = {
      ...base,
      sizes: [
        { size: 36, qty: 2 },
        { size: 41, qty: 3 },
      ],
    };
    expect(intakeSchema.safeParse(many).success).toBe(true);
  });

  // An empty grid is «нічого не привезли» — a request with nothing to do, and
  // the scanner disables saving for exactly this reason.
  it('відхиляє порожній список розмірів', () => {
    expect(intakeSchema.safeParse({ ...base, sizes: [] }).success).toBe(false);
  });

  // Summing a repeat would take in pairs nobody asked for, so it is refused
  // rather than guessed at.
  it('відхиляє повторений розмір', () => {
    const dup = {
      ...base,
      sizes: [
        { size: 38, qty: 1 },
        { size: 38, qty: 2 },
      ],
    };
    expect(intakeSchema.safeParse(dup).success).toBe(false);
  });

  it('відхиляє кількість 0 і від’ємну', () => {
    expect(intakeSchema.safeParse({ ...base, sizes: [{ size: 38, qty: 0 }] }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...base, sizes: [{ size: 38, qty: -1 }] }).success).toBe(false);
  });

  it('відхиляє розмір поза межами 16–50', () => {
    expect(
      intakeSchema.safeParse({ ...base, sizes: [{ size: SIZE_MAX + 1, qty: 1 }] }).success,
    ).toBe(false);
  });
});

describe('adminIntakeSchema', () => {
  const base = { sizes: [{ size: 38, qty: 1 }], color: '36', style: '7645' };

  // An admin's intake without a price skips the queue and never gets a basis.
  it('вимагає від адміна ціну закупки', () => {
    const missing = adminIntakeSchema.safeParse(base);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.path).toEqual(['purchasePriceUsd']);
    expect(adminIntakeSchema.safeParse({ ...base, purchasePriceUsd: null }).success).toBe(false);
  });

  it('приймає ціну і 0 — «без ціни — старий товар»', () => {
    expect(adminIntakeSchema.safeParse({ ...base, purchasePriceUsd: 35 }).success).toBe(true);
    expect(adminIntakeSchema.safeParse({ ...base, purchasePriceUsd: 0 }).success).toBe(true);
  });
});

describe('overviewQuerySchema', () => {
  it('період за замовчуванням — сьогодні', () => {
    expect(overviewQuerySchema.parse({})).toEqual({ period: 'today' });
  });

  it('приймає коректний довільний період, зокрема один день', () => {
    expect(
      overviewQuerySchema.safeParse({ period: 'custom', from: '2026-10-01', to: '2026-10-15' })
        .success,
    ).toBe(true);
    expect(
      overviewQuerySchema.safeParse({ period: 'custom', from: '2026-10-15', to: '2026-10-15' })
        .success,
    ).toBe(true);
  });

  it('відхиляє дату не у форматі РРРР-ММ-ДД і неіснуючу дату', () => {
    for (const from of ['2026-1-01', '15.10.2026', 'yesterday', '2026-02-30', '2026-13-01']) {
      expect(overviewQuerySchema.safeParse({ period: 'custom', from }).success).toBe(false);
    }
  });

  it('відхиляє період, де початок пізніше за кінець', () => {
    const parsed = overviewQuerySchema.safeParse({
      period: 'custom',
      from: '2026-10-15',
      to: '2026-10-01',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['from']);
  });

  it(`відхиляє період довший за ${OVERVIEW_MAX_RANGE_DAYS} днів`, () => {
    // 2025-01-01..2025-12-31 is 365 days; a leap year adds the 366th.
    expect(
      overviewQuerySchema.safeParse({ period: 'custom', from: '2024-01-01', to: '2024-12-31' })
        .success,
    ).toBe(true);
    expect(
      overviewQuerySchema.safeParse({ period: 'custom', from: '2024-01-01', to: '2025-01-01' })
        .success,
    ).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('обрізає пробіли в логіні', () => {
    expect(loginRequestSchema.parse({ login: ' olia ', password: 'secret' }).login).toBe('olia');
  });

  it('відхиляє порожній пароль', () => {
    expect(loginRequestSchema.safeParse({ login: 'olia', password: '' }).success).toBe(false);
  });
});

describe('usdToUah', () => {
  // The books are kept in whole hryvnia, so the conversion rounds — and it
  // rounds once, on the way in, not on every read.
  it('конвертує і округлює до цілої гривні', () => {
    expect(usdToUah(35, 40)).toBe(1400);
    expect(usdToUah(35, 41.73)).toBe(1461); // 1460.55 → 1461
    expect(usdToUah(12.5, 44.7)).toBe(559); // 558.75 → 559
  });

  // «Без ціни — старий товар» is $0 and must stay 0 at any rate.
  it('нуль лишається нулем за будь-якого курсу', () => {
    expect(usdToUah(0, 44.7)).toBe(0);
  });
});
