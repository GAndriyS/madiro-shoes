import { expect, test } from '@playwright/test';

import { ADMIN, manualIntake, manualSale, scannerSignIn, uniqueStyle } from './helpers';

/**
 * S-15.4 — customer return through manual entry: the last sale is found by
 * the typed tag, the pair goes back to stock, my-sales nets the sale out.
 */
test('повернення за вручну введеною біркою: пара знову на складі', async ({ page }) => {
  const tag = { size: '39', color: '12', style: uniqueStyle() };

  await scannerSignIn(page, ADMIN.login, ADMIN.password);
  await manualIntake(page, tag, '30'); // $30 → 1 200 ₴
  await manualSale(page, tag, '2700', 'CASH');

  await page.goto('/return');
  await page.getByTestId('camera-manual').click();
  await page.getByTestId('field-size').fill(tag.size);
  await page.getByTestId('field-color').fill(tag.color);
  await page.getByTestId('field-style').fill(tag.style);

  // The last-sale card: pair, «Продано … · готівка», the sale price.
  await expect(page.getByText(`${tag.style} · колір ${tag.color} · р. ${tag.size}`)).toBeVisible();
  await expect(page.getByText(/Продано .*готівка/)).toBeVisible();
  await page.getByTestId('return-confirm').click();
  await expect(page.getByText('Повернення зареєстровано')).toBeVisible();

  // Back in stock: the reference search finds the size again.
  await page.goto('/search');
  await page.getByTestId('stock-search-input').fill(tag.style);
  await expect(page.getByText(`${tag.style} · колір ${tag.color}`)).toBeVisible();

  // My sales shows the return netting the sale out.
  await page.goto('/my-sales');
  // Filter by the pair: the list accumulates returns across runs, and the
  // testid alone would match every one of them.
  await expect(
    page
      .getByTestId('my-sales-row-RETURN')
      .filter({ hasText: `${tag.style} · ${tag.color} · р. ${tag.size}` }),
  ).toHaveCount(1);
});
