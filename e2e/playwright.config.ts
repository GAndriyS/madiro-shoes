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
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://madiro:madiro@localhost:5432/madiro_e2e?schema=public';

export const ADMIN = { login: 'admin', password: 'admin-e2e-password' } as const;
export const DASHBOARD_URL = 'http://localhost:5173';

const apiEnv = {
  DATABASE_URL,
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789-0123456789',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-9876543210-9876543210',
  ADMIN_LOGIN: ADMIN.login,
  ADMIN_PASSWORD: ADMIN.password,
  ADMIN_NAME: 'Адміністратор',
  CORS_ORIGINS: 'http://localhost:5174,http://localhost:5173',
  PORT: '3000',
  // Recognition must read the same numbers every run and must never spend
  // Gemini quota — the mock is the provider under test here, not the model.
  VISION_PROVIDER: 'mock',
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
  webServer: [
    {
      command:
        'pnpm --filter @madiro/shared build && pnpm --filter @madiro/api build && pnpm --filter @madiro/api db:deploy && pnpm --filter @madiro/api db:seed && pnpm --filter @madiro/api start',
      url: 'http://localhost:3000/api/health',
      timeout: 300_000,
      reuseExistingServer: false,
      env: apiEnv,
    },
    {
      command: 'pnpm --filter @madiro/scanner build && pnpm --filter @madiro/scanner preview',
      url: 'http://localhost:5174',
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @madiro/dashboard build && pnpm --filter @madiro/dashboard preview',
      url: 'http://localhost:5173',
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
