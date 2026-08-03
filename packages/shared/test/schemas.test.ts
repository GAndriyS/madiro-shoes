import { describe, expect, it } from 'vitest';

import {
  usdToUah,
  intakeSchema,
  loginRequestSchema,
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
  const base = { size: 38, color: '36', style: '7645' };

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
