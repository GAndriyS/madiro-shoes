import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { ADMIN, API_URL, DASHBOARD_URL, MOCK_TAG } from '../playwright.config';

export { ADMIN, DASHBOARD_URL, MOCK_TAG };

export const API = API_URL;

/** Every auth route needs the client id — CSRF guard and cookie selector. */
const clientHeader = (client: 'scanner' | 'dashboard') => ({ 'x-madiro-client': client });

/** An access token straight from the API, for fixtures and read-back checks. */
export async function apiLogin(
  request: APIRequestContext,
  login: string,
  password: string,
  client: 'scanner' | 'dashboard' = 'dashboard',
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    headers: clientHeader(client),
    data: { login, password },
  });
  expect(res.ok(), `login ${login}: ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export const adminToken = (request: APIRequestContext): Promise<string> =>
  apiLogin(request, ADMIN.login, ADMIN.password);

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** What `POST /intake` answers with — one variant, one entry per pair created. */
export interface IntakeResult {
  variantId: string;
  pairs: { pairId: string; size: number }[];
}

/**
 * Seed pairs straight through the API, the way a fixture wants to: a tag and
 * how many of it.
 *
 * The request shape lives HERE and nowhere else. Five specs used to build it
 * inline, and all five broke together the day `size` became `sizes` — the
 * unit tests and the api e2e suite were already updated, so nothing caught it
 * until CI ran Playwright on main (run 30925696316).
 */
export async function apiIntake(
  request: APIRequestContext,
  token: string,
  tag: { size: number | string; color: string; style: string; season?: string },
  options: { qty?: number; purchasePriceUsd?: number } = {},
): Promise<IntakeResult> {
  const res = await request.post(`${API}/intake`, {
    headers: bearer(token),
    data: {
      sizes: [{ size: Number(tag.size), qty: options.qty ?? 1 }],
      color: tag.color,
      style: tag.style,
      ...(tag.season ? { season: tag.season } : {}),
      // Dollars — the api converts and stores hryvnia. Sellers cannot price at
      // all, so a fixture that omits this is exactly how a draft is made.
      ...(options.purchasePriceUsd != null ? { purchasePriceUsd: options.purchasePriceUsd } : {}),
    },
  });
  expect(res.ok(), `intake ${tag.style}: ${res.status()}`).toBeTruthy();
  return (await res.json()) as IntakeResult;
}

/**
 * A seller nobody else's spec shares. Created through the admin API and
 * recreated idempotently, so a re-run never trips over its own leftovers.
 */
export async function seedSeller(
  request: APIRequestContext,
  tag: string,
): Promise<{ id: string; name: string; login: string; password: string; token: string }> {
  const admin = await adminToken(request);
  const seller = {
    name: `Тест ${tag}`,
    login: `e2e-${tag}-${Math.floor(Math.random() * 100000)}`,
    password: `e2e-${tag}-pass1`,
  };
  const created = await request.post(`${API}/users`, { headers: bearer(admin), data: seller });
  expect(created.ok(), `create seller: ${created.status()}`).toBeTruthy();
  const { id } = (await created.json()) as { id: string };

  return {
    ...seller,
    id,
    token: await apiLogin(request, seller.login, seller.password, 'scanner'),
  };
}

/** Sign into the DASHBOARD (admin only) and land on the overview. */
export async function dashboardSignIn(page: Page, login: string, password: string): Promise<void> {
  await page.goto(`${DASHBOARD_URL}/login`);
  await page.getByTestId('login-input').fill(login);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('kpi-revenue')).toBeVisible();
}

/**
 * Selectors: `data-testid` first, visible text only where the text IS the
 * assertion.
 *
 * The apps ship in Ukrainian and English, and copy changes with every design
 * pass — a spec anchored on a label breaks for reasons that have nothing to do
 * with behaviour. Test ids are a deliberate contract: renaming one is a change
 * you make on purpose. Convention: `kebab-case`, `<area>-<thing>`, and for a
 * group of options `<group>-<ENUM_VALUE>` (`payment-CARD`, `season-BAIKA`) so
 * the value comes from the domain, not from a translation.
 */

/**
 * A 4-digit style no other scenario is using. `7645` is excluded on purpose:
 * that is what the mock vision provider reads off every photo, so the
 * recognition specs own it — a random collision there would put a stranger's
 * pair in this spec's queue.
 */
export function uniqueStyle(): string {
  let style: string = MOCK_TAG.style;
  while (style === MOCK_TAG.style) {
    style = String(1000 + Math.floor(Math.random() * 9000));
  }
  return style;
}

/** Sign into the SCANNER (both roles may enter). Lands on the home hub. */
export async function scannerSignIn(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-input').fill(login);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('home-greeting')).toBeVisible();
}

/**
 * Manual intake through the UI (S-1): camera is unavailable in headless
 * chromium, so the «Ввести вручну» escape IS the flow under test.
 * Admin fills a purchase price; a seller saves a draft.
 *
 * `purchasePriceUsd` is in DOLLARS — the currency the form is in. The API
 * stores hryvnia at the run's pinned rate (EXCHANGE_RATE_USD, $1 = 40 ₴), so
 * an assertion about stored money multiplies by RATE.
 */
export async function manualIntake(
  page: Page,
  tag: { size: string; color: string; style: string; qty?: string },
  purchasePriceUsd?: string,
): Promise<void> {
  await page.goto('/intake');
  await page.getByTestId('camera-manual').click();
  // Sizes are a quantity grid now, not a field: one pair unless asked otherwise.
  await page.getByTestId(`size-qty-${tag.size}`).fill(tag.qty ?? '1');
  await page.getByTestId('field-color').fill(tag.color);
  await page.getByTestId('field-style').fill(tag.style);
  if (purchasePriceUsd != null) {
    await page.getByTestId('purchase-price-input').fill(purchasePriceUsd);
  }
  await page.getByTestId('intake-save-finish').click();
  await expect(page.getByTestId('home-greeting')).toBeVisible();
}

/** Manual checkout: /manual → tag fields → sale with price and payment. */
export async function manualSale(
  page: Page,
  tag: { size: string; color: string; style: string },
  salePrice: string,
  payment: 'CASH' | 'CARD',
): Promise<void> {
  await page.goto('/manual');
  await page.getByTestId('field-size').fill(tag.size);
  await page.getByTestId('field-color').fill(tag.color);
  await page.getByTestId('field-style').fill(tag.style);
  await page.getByTestId('sale-next').click();
  await page.getByTestId('sale-price-input').fill(salePrice);
  await page.getByTestId(`payment-${payment}`).click();
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('toast-success')).toBeVisible();
}
