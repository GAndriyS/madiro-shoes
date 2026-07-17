import { describe, expect, it } from 'vitest';

import {
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

  it('приймає явне «без ціни — старий товар» (null)', () => {
    expect(intakeSchema.safeParse({ ...base, purchasePrice: null }).success).toBe(true);
  });

  it('відхиляє від’ємну ціну закупки', () => {
    expect(intakeSchema.safeParse({ ...base, purchasePrice: -100 }).success).toBe(false);
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
