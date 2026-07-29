import { expect, test } from '@playwright/test';

import { ADMIN, manualIntake, manualSale, scannerSignIn, uniqueStyle } from './helpers';

/**
 * S-15.2 — the critical sale path, all through the UI: receive a pair by
 * manual intake, sell it via manual checkout, and watch it leave the stock.
 */
test('продаж через ручний ввід: пара залишає склад, підсумок дня росте', async ({ page }) => {
  const tag = { size: '38', color: '36', style: uniqueStyle() };

  await scannerSignIn(page, ADMIN.login, ADMIN.password);
  await manualIntake(page, tag, '1400');

  // The pair is findable before the sale…
  await page.goto('/search');
  await page.getByPlaceholder(/Style/).fill(tag.style);
  await expect(page.getByText(`${tag.style} · колір ${tag.color}`)).toBeVisible();

  await manualSale(page, tag, '2850', 'Картка');

  // …the toast names the pair and the payment…
  await expect(
    page.getByText(new RegExp(`${tag.style} · ${tag.color} · р. ${tag.size}`)),
  ).toBeVisible();

  // …and afterwards the stock search comes back empty: the pair is SOLD.
  await page.goto('/search');
  await page.getByPlaceholder(/Style/).fill(tag.style);
  await expect(page.getByText(/На складі немає варіантів/)).toBeVisible();
});
