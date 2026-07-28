import { refreshCookieOptions, ttlToMs } from './refresh-cookie';

describe('refresh cookie', () => {
  it('ttlToMs розбирає формат JWT TTL', () => {
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('12h')).toBe(43_200_000);
    expect(ttlToMs('30d')).toBe(2_592_000_000);
    expect(ttlToMs('45s')).toBe(45_000);
  });

  it('ttlToMs: сміття або нуль → 30 днів, а не вічна/нульова кука', () => {
    expect(ttlToMs('forever')).toBe(2_592_000_000);
    expect(ttlToMs('0d')).toBe(2_592_000_000);
  });

  it('прод: httpOnly + Secure + SameSite=None (фронти на інших origin-ах)', () => {
    const options = refreshCookieOptions({ NODE_ENV: 'production', JWT_REFRESH_TTL: '30d' });

    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api/auth',
      maxAge: 2_592_000_000,
    });
  });

  it('dev: httpOnly лишається, Secure — ні (localhost без HTTPS)', () => {
    const options = refreshCookieOptions({ NODE_ENV: 'development', JWT_REFRESH_TTL: '30d' });

    expect(options).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax' });
  });
});
