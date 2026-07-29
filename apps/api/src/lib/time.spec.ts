import { storeDayStart, storeMonthRange } from './time';

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

describe('storeMonthRange', () => {
  it('охоплює місяць від київської півночі 1-го до півночі 1-го наступного', () => {
    const { start, end } = storeMonthRange('2026-07');

    // Липень — літній час (UTC+3), тож київська північ це 21:00 UTC попереднього дня.
    expect(start.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });

  it('грудень перекочується на січень наступного року', () => {
    const { start, end } = storeMonthRange('2026-12');

    expect(start.toISOString()).toBe('2026-11-30T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T22:00:00.000Z');
  });

  it('лютий високосного року закінчується 29-м', () => {
    const { start, end } = storeMonthRange('2028-02');

    expect(start.toISOString()).toBe('2028-01-31T22:00:00.000Z');
    expect(end.toISOString()).toBe('2028-02-29T22:00:00.000Z');
  });

  it('межа переходу на літній час не з’їдає добу', () => {
    // Перехід на літній час у Києві — остання неділя березня.
    const { start, end } = storeMonthRange('2026-03');

    expect(start.toISOString()).toBe('2026-02-28T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-31T21:00:00.000Z');
  });
});
