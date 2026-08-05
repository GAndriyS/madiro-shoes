import { validateEnv } from './env.validation';

const required = {
  DATABASE_URL: 'postgresql://madiro:madiro@localhost:5432/madiro?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('приймає мінімальну конфігурацію і підставляє дефолти', () => {
    const env = validateEnv({ ...required });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.LOG_LEVEL).toBeUndefined();
  });

  // .env.example ships LOG_LEVEL="" / GEMINI_API_KEY="", and dotenv turns those
  // into empty strings — an optional enum would reject '' and the API would not
  // start for anyone who copied the example verbatim.
  it('трактує порожнє значення як невказане, а не як помилку', () => {
    const env = validateEnv({ ...required, LOG_LEVEL: '', GEMINI_API_KEY: '' });

    expect(env.LOG_LEVEL).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it('приймає заповнений LOG_LEVEL', () => {
    expect(validateEnv({ ...required, LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe('warn');
  });

  it('відхиляє некоректний LOG_LEVEL', () => {
    expect(() => validateEnv({ ...required, LOG_LEVEL: 'verbose' })).toThrow(
      /Некоректна конфігурація env/,
    );
  });

  it('відхиляє закороткі секрети', () => {
    expect(() => validateEnv({ ...required, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /Некоректна конфігурація env/,
    );
  });

  it('VISION_PROVIDER за замовчуванням auto', () => {
    expect(validateEnv({ ...required }).VISION_PROVIDER).toBe('auto');
  });

  it('дозволяє форсувати мок поза production', () => {
    const env = validateEnv({ ...required, VISION_PROVIDER: 'mock', GEMINI_API_KEY: 'real-key' });

    expect(env.VISION_PROVIDER).toBe('mock');
  });

  // The flag exists to make recognition testable, not to fake the real books.
  it('забороняє мок при APP_ENV=production', () => {
    expect(() =>
      validateEnv({
        ...required,
        NODE_ENV: 'production',
        APP_ENV: 'production',
        VISION_PROVIDER: 'mock',
      }),
    ).toThrow(/mock заборонено при APP_ENV=production/);
  });

  it('gemini без ключа — помилка старту, а не 503 у рантаймі', () => {
    expect(() => validateEnv({ ...required, VISION_PROVIDER: 'gemini' })).toThrow(
      /потребує GEMINI_API_KEY/,
    );
  });

  describe('APP_ENV', () => {
    it('за замовчуванням development', () => {
      expect(validateEnv({ ...required }).APP_ENV).toBe('development');
    });

    // DEMO runs the same production build as PROD; what it may do differs.
    it('demo — це production-збірка з іншими правами', () => {
      const env = validateEnv({
        ...required,
        NODE_ENV: 'production',
        APP_ENV: 'demo',
        VISION_PROVIDER: 'mock',
        EXCHANGE_RATE_USD: '40',
      });

      expect(env.APP_ENV).toBe('demo');
      expect(env.VISION_PROVIDER).toBe('mock');
      expect(env.EXCHANGE_RATE_USD).toBe(40);
    });

    // A deployed environment on a dev build would ship insecure cookies and
    // debug logging to a public domain.
    it.each(['demo', 'production'])('%s вимагає NODE_ENV=production', (appEnv) => {
      expect(() => validateEnv({ ...required, APP_ENV: appEnv })).toThrow(
        new RegExp(`APP_ENV=${appEnv} потребує NODE_ENV=production`),
      );
    });

    it('фіксований курс заборонено при APP_ENV=production', () => {
      expect(() =>
        validateEnv({
          ...required,
          NODE_ENV: 'production',
          APP_ENV: 'production',
          EXCHANGE_RATE_USD: '40',
        }),
      ).toThrow(/EXCHANGE_RATE_USD заборонено при APP_ENV=production/);
    });
  });
});
