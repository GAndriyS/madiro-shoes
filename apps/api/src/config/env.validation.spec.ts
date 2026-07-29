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
});
