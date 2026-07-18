import { storeDayStart } from './time';

describe('storeDayStart (Europe/Kyiv)', () => {
  it('повертає північ за київським часом у літній період (UTC+3)', () => {
    // 2026-07-18 10:30 Kyiv == 07:30 UTC
    const now = new Date('2026-07-18T07:30:00.000Z');
    expect(storeDayStart(now).toISOString()).toBe('2026-07-17T21:00:00.000Z');
  });

  it('переносить межу дня: 01:30 за Києвом — це вже наступна доба', () => {
    // 2026-07-18 01:30 Kyiv == 2026-07-17 22:30 UTC
    const now = new Date('2026-07-17T22:30:00.000Z');
    expect(storeDayStart(now).toISOString()).toBe('2026-07-17T21:00:00.000Z');
  });

  it('зимовий час (UTC+2): північ Києва — 22:00 UTC попереднього дня', () => {
    // 2026-01-15 12:00 Kyiv == 10:00 UTC
    const now = new Date('2026-01-15T10:00:00.000Z');
    expect(storeDayStart(now).toISOString()).toBe('2026-01-14T22:00:00.000Z');
  });
});
