import { expect, test } from '@playwright/test';

import { ADMIN, manualIntake, manualSale, scannerSignIn, uniqueStyle } from './helpers';

/**
 * S-15.4 — customer return through manual entry: the last sale is found by
 * the typed tag, the pair goes back to stock, my-sales nets the sale out.
 */
test('повернення за вручну введеною біркою: пара знову на складі', async ({ page }) => {
  const tag = { size: '39', color: '12', style: uniqueStyle() };

  await scannerSignIn(page, ADMIN.login, ADMIN.password);
  await manualIntake(page, tag, '1200');
  await manualSale(page, tag, '2700', 'Готівка');

  await page.goto('/return');
  await page.getByRole('button', { name: 'Ввести вручну' }).click();
  await page.getByLabel('SIZE').fill(tag.size);
  await page.getByLabel('COLOR').fill(tag.color);
  await page.getByLabel('STYLE').fill(tag.style);

  // The last-sale card: pair, «Продано … · готівка», the sale price.
  await expect(page.getByText(`${tag.style} · колір ${tag.color} · р. ${tag.size}`)).toBeVisible();
  await expect(page.getByText(/Продано .*готівка/)).toBeVisible();
  await page.getByRole('button', { name: /Повернути на склад/ }).click();
  await expect(page.getByText('Повернення зареєстровано')).toBeVisible();

  // Back in stock: the reference search finds the size again.
  await page.goto('/search');
  await page.getByPlaceholder(/Style/).fill(tag.style);
  await expect(page.getByText(`${tag.style} · колір ${tag.color}`)).toBeVisible();

  // My sales shows the return netting the sale out.
  await page.goto('/my-sales');
  await expect(
    page.getByText(`${tag.style} · ${tag.color} · р. ${tag.size} — повернення`),
  ).toBeVisible();
});
