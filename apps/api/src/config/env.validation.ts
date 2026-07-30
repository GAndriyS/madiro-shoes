import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  /**
   * Which vision provider to bind. `auto` (default) keeps the historic rule —
   * key present → Gemini, otherwise mock outside production. `mock` forces the
   * deterministic stand-in even when a key is configured, which is what makes
   * recognition testable: a test run must not depend on what a live model
   * reads off a photo, nor spend quota. `mock` is refused in production so the
   * flag can never silently fake real usage.
   */
  VISION_PROVIDER: z.enum(['auto', 'mock', 'gemini']).default('auto'),
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

  if (env.NODE_ENV === 'production' && env.VISION_PROVIDER === 'mock') {
    throw new Error('VISION_PROVIDER=mock заборонено в production.');
  }
  if (env.VISION_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
    throw new Error('VISION_PROVIDER=gemini потребує GEMINI_API_KEY.');
  }

  return env;
}
