import { expect, test, type Page } from '@playwright/test';

import { ADMIN, apiIntake, manualIntake, scannerSignIn, seedSeller, uniqueStyle } from './helpers';

/**
 * Suite G — the scanner's reference search. Read-only by design: it must show
 * what is on the shelf and never a purchase price (FR-B-02), and it marks the
 * sizes still awaiting one (FR-S-16), so a seller knows the pair is sellable
 * but unpriced.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
const style = uniqueStyle();
const priced = { size: '40', color: '41', style };
const draftSize = 41;

test.beforeAll(async ({ browser, request }) => {
  const seller = await seedSeller(request, 'search');
  // Same variant, two pairs: one priced by the admin, one still a draft.
  await apiIntake(request, seller.token, { size: draftSize, color: priced.color, style });

  page = await browser.newPage({ viewport: { width: 393, height: 851 } });
  await scannerSignIn(page, ADMIN.login, ADMIN.password);
  await manualIntake(page, priced, '37.5'); // $37.50 → 1 500 ₴
});

test.afterAll(async () => {
  await page.close();
});

test('пошук за стилем показує розміри на складі, без цін (TC-G-01)', async () => {
  await page.goto('/search');
  await page.getByTestId('stock-search-input').fill(style);

  const result = page.getByTestId('stock-search-result');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText(`${style} · колір ${priced.color}`);
  await expect(result).toContainText(priced.size);
  await expect(result).toContainText(String(draftSize));
  // A seller never sees what the shop paid — not even here.
  await expect(result).not.toContainText('1 500');
});

test('чип «очікує ціни» рахує саме чернеткові пари (TC-G-02)', async () => {
  await page.goto('/search');
  await page.getByTestId('stock-search-input').fill(style);

  // One of the two pairs is a draft, so the chip says exactly one.
  await expect(page.getByTestId('stock-search-result')).toContainText(/1 очікує ціни/);
});

test('запит коротший за 2 цифри нічого не шукає (TC-G-01)', async () => {
  await page.goto('/search');
  await page.getByTestId('stock-search-input').fill('7');

  await expect(page.getByText('Введіть щонайменше 2 цифри стилю')).toBeVisible();
  await expect(page.getByTestId('stock-search-result')).toHaveCount(0);
});
