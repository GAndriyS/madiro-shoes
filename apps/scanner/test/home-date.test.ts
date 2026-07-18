import { describe, expect, it } from 'vitest';

import { homeDate } from '../src/lib/homeDate';

describe('homeDate', () => {
  const noon = new Date('2026-07-14T12:00:00');

  it('українською: день тижня з великої', () => {
    expect(homeDate('uk', noon)).toBe('Вівторок, 14 липня');
  });

  it('англійською (en-GB — без коми після дня тижня)', () => {
    expect(homeDate('en', noon)).toBe('Tuesday 14 July');
  });
});
