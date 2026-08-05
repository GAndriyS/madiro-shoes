import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Which deployment this is, as opposed to how Node is built.
   *
   * DEMO and PROD both run `NODE_ENV=production` — they are the same production
   * build, and everything that keying on NODE_ENV protects (secure cookies,
   * JSON logging, the real vision provider) must hold in both. What differs is
   * what the environment is *for*: DEMO may be reset and reseeded at will, PROD
   * holds the shop's real books. That distinction lives here.
   */
  APP_ENV: z.enum(['development', 'demo', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  // >= 32 chars (256-bit); generate with `openssl rand -hex 32`.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  /** Comma-separated allowlist of browser origins for CORS. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /**
   * Vision provider key (Gemini). Optional: without it dev/test fall back to
   * the mock provider and production answers 503 on /tags/recognize.
   */
  GEMINI_API_KEY: z.string().optional(),
  /** OpenRouter key — the preferred vision backend when both are configured. */
  OPENROUTER_API_KEY: z.string().optional(),
  /**
   * Model slug for OpenRouter. Optional: the provider ships a benchmarked
   * default, and this only exists so a better model can be adopted from the
   * dashboard without a redeploy.
   */
  OPENROUTER_MODEL: z.string().optional(),
  /**
   * Which vision provider to bind. `auto` (default) prefers OpenRouter, falls
   * back to Gemini, and otherwise uses the mock outside production. `mock`
   * forces the deterministic stand-in even when a key is configured, which is
   * what makes recognition testable: a test run must not depend on what a live
   * model reads off a photo, nor spend quota. `mock` is refused when
   * `APP_ENV=production` so the flag can never silently fake real usage; DEMO
   * may use it deliberately, since nothing there is a real transaction.
   */
  VISION_PROVIDER: z.enum(['auto', 'mock', 'gemini', 'openrouter']).default('auto'),
  /**
   * Fixes the USD rate instead of asking the provider. Exists for automated
   * runs: a suite that asserts stored hryvnia cannot depend on what the cash
   * desk quotes today. Refused when `APP_ENV=production` — a frozen rate in the
   * real books would quietly misprice every purchase.
   */
  EXCHANGE_RATE_USD: z.coerce.number().positive().optional(),
  /**
   * Per-minute rate limits on the auth routes. Defaults are the production
   * values; an automated suite raises them because it makes dozens of honest
   * logins a minute, and being throttled would only prove the limit exists.
   * Read via process.env in the controller — @Throttle is evaluated when the
   * class is defined, before any DI container exists.
   */
  AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  AUTH_REFRESH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  /** Per-minute ceiling on everything else; same reasoning as the two above. */
  GLOBAL_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  /** Pino level; defaults to `info` in production and `debug` elsewhere. */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  // A variable left blank in .env (`LOG_LEVEL=""`, as .env.example ships it)
  // arrives as an empty string, which is not the same thing as unset: an
  // optional enum rejects '' and the API refuses to boot. Blank means "not
  // configured" for every variable here, so drop those before validating —
  // otherwise every future optional field inherits the same trap.
  const provided = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== ''));

  const result = envSchema.safeParse(provided);
  if (!result.success) {
    throw new Error(`Некоректна конфігурація env:\n${result.error.message}`);
  }
  const env = result.data;

  // A deployed environment is always a production build: anything else would
  // ship insecure cookies and dev logging to a public domain.
  if (env.APP_ENV !== 'development' && env.NODE_ENV !== 'production') {
    throw new Error(`APP_ENV=${env.APP_ENV} потребує NODE_ENV=production.`);
  }
  if (env.APP_ENV === 'production' && env.VISION_PROVIDER === 'mock') {
    throw new Error('VISION_PROVIDER=mock заборонено при APP_ENV=production.');
  }
  if (env.VISION_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
    throw new Error('VISION_PROVIDER=gemini потребує GEMINI_API_KEY.');
  }
  if (env.VISION_PROVIDER === 'openrouter' && !env.OPENROUTER_API_KEY) {
    throw new Error('VISION_PROVIDER=openrouter потребує OPENROUTER_API_KEY.');
  }
  if (env.APP_ENV === 'production' && env.EXCHANGE_RATE_USD != null) {
    throw new Error(
      'EXCHANGE_RATE_USD заборонено при APP_ENV=production — курс має бути справжнім.',
    );
  }

  return env;
}
