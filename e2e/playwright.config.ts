import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * Browser e2e over the real stack: NestJS api + built scanner (5174) and
 * dashboard (5173), both serving /api through their preview proxy — one
 * origin per app, no CORS in the loop.
 *
 * The database defaults to a dedicated local `madiro_e2e` so a run never
 * touches dev data; CI overrides DATABASE_URL to its postgres service. The
 * admin comes from the api's own seed (ADMIN_LOGIN/ADMIN_PASSWORD below);
 * sellers and stock are created through the UI/API by the tests themselves.
 */

/**
 * Port overrides live in the monorepo-root .env — the same file docker compose
 * reads — so a machine whose 5432/3000 belong to another project configures
 * them once. Real environment variables still win, which is how CI overrides
 * DATABASE_URL wholesale. Absent file → defaults, which is the normal case.
 */
function rootEnv(name: string, fallback: string): string {
  if (process.env[name]) return process.env[name];
  try {
    const file = readFileSync(resolve(__dirname, '..', '.env'), 'utf8');
    const hit = file.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1];
    return hit ? hit.replace(/^["']|["']$/g, '') : fallback;
  } catch {
    return fallback;
  }
}

const PG_PORT = rootEnv('POSTGRES_PORT', '5432');
const API_PORT = rootEnv('API_PORT', '3000');
const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://madiro:madiro@localhost:${PG_PORT}/madiro_e2e?schema=public`;

export const ADMIN = { login: 'admin', password: 'admin-e2e-password' } as const;
export const DASHBOARD_URL = 'http://localhost:5173';
export const API_URL = `http://localhost:${API_PORT}/api`;

export const apiEnv = {
  DATABASE_URL,
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789-0123456789',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-9876543210-9876543210',
  ADMIN_LOGIN: ADMIN.login,
  ADMIN_PASSWORD: ADMIN.password,
  ADMIN_NAME: 'Адміністратор',
  CORS_ORIGINS: 'http://localhost:5174,http://localhost:5173',
  PORT: API_PORT,
  // Recognition must read the same numbers every run and must never spend
  // Gemini quota — the mock is the provider under test here, not the model.
  VISION_PROVIDER: 'mock',
  // The suite makes dozens of honest logins a minute; production limits (10/20)
  // would throttle it and prove nothing. Rate limiting itself stays a manual
  // check (TC-K-05) — it is configuration, enforced by @nestjs/throttler.
  // Purchase prices are entered in dollars and stored in hryvnia; a live quote
  // would make «$35 → 1400 ₴» unassertable. $1 = 40 ₴ keeps the arithmetic
  // readable in the specs.
  EXCHANGE_RATE_USD: '40',
  AUTH_LOGIN_RATE_LIMIT: '500',
  AUTH_REFRESH_RATE_LIMIT: '2000',
  GLOBAL_RATE_LIMIT: '100000',
};

/** What the mock vision provider returns for any photo (mock.provider.ts). */
export const MOCK_TAG = { size: '38', color: '36', style: '7645' } as const;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    locale: 'uk-UA',
  },
  projects: [
    {
      name: 'chromium',
      // The scanner is mobile-first; the dashboard spec widens its viewport itself.
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Builds and migrations happen once, before any server — see global-setup.ts.
  globalSetup: './global-setup.ts',
  // Every command below is a single process, no shell chain. That is what lets
  // Playwright stop them cleanly on any platform: a chained command would leave
  // node holding the API port after shutdown, and the next run would find a
  // healthy-looking API — the previous run's, on whatever database it had.
  // Starting node directly also means the API is configured only by `env`
  // below, never by apps/api/.env.
  webServer: [
    {
      command: 'node ../apps/api/dist/main.js',
      url: `${API_URL}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: apiEnv,
    },
    {
      command: 'pnpm --filter @madiro/scanner preview',
      url: 'http://localhost:5174',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @madiro/dashboard preview',
      url: 'http://localhost:5173',
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
