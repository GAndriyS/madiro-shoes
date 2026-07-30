import { expect, type Page } from '@playwright/test';

export { ADMIN, DASHBOARD_URL } from '../playwright.config';

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

/** Unique 4-digit style per call so scenarios never collide across runs. */
export function uniqueStyle(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/**
 * Sign into the SCANNER (both roles may enter). Lands on the home hub.
 *
 * BUDGET: `POST /auth/login` is throttled to 10/min per IP and the suite runs
 * with `workers: 1`, so every spec draws on one shared allowance. Sign in once
 * per spec file (a serial describe with a shared page) rather than per test —
 * otherwise a spec added today makes an unrelated spec fail tomorrow with a
 * confusing "greeting not visible".
 */
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
 */
export async function manualIntake(
  page: Page,
  tag: { size: string; color: string; style: string },
  purchasePrice?: string,
): Promise<void> {
  await page.goto('/intake');
  await page.getByTestId('camera-manual').click();
  await page.getByTestId('field-size').fill(tag.size);
  await page.getByTestId('field-color').fill(tag.color);
  await page.getByTestId('field-style').fill(tag.style);
  if (purchasePrice != null) {
    await page.getByTestId('purchase-price-input').fill(purchasePrice);
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
