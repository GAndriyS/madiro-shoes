import { expect, test, type Page } from '@playwright/test';

import {
  apiIntake,
  manualIntake,
  manualSale,
  scannerSignIn,
  seedSeller,
  uniqueStyle,
} from './helpers';

/**
 * Suite F — what a seller sees about their own day: sales, the write-off row
 * that rides along without touching the totals (S-5), and the drafts they may
 * still edit or delete.
 *
 * A dedicated seller per run keeps the figures exact: «мої продажі» is a
 * personal total, so a shared account would mix in other specs' operations.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
let seller: Awaited<ReturnType<typeof seedSeller>>;
const sold = { size: '36', color: '31', style: uniqueStyle() };
const writtenOff = { size: '37', color: '32', style: uniqueStyle() };
const draft = { size: 38, color: '33', style: uniqueStyle() };

test.beforeAll(async ({ browser, request }) => {
  seller = await seedSeller(request, 'sales');
  // A draft to edit and delete later, made through the API as this seller.
  await apiIntake(request, seller.token, draft);

  page = await browser.newPage({ viewport: { width: 393, height: 851 } });
  await scannerSignIn(page, seller.login, seller.password);
});

test.afterAll(async () => {
  await page.close();
});

test('продаж потрапляє в «Мої продажі» і в підсумок дня (TC-F-01)', async () => {
  // A seller cannot price an intake, so the pair enters as a draft and is
  // sellable straight away — that is the whole point of the draft rule.
  await manualIntake(page, sold);
  await manualSale(page, sold, '2400', 'CASH');

  await page.goto('/my-sales');
  await expect(row('SALE', sold)).toHaveCount(1);
  await expect(page.getByText('пар продано')).toBeVisible();
  await expect(page.getByText('2 400 ₴').first()).toBeVisible();
});

test('списання показане окремим рядком і не входить у підсумки (TC-F-02)', async () => {
  await manualIntake(page, writtenOff);

  await page.goto('/manual');
  await page.getByTestId('field-size').fill(writtenOff.size);
  await page.getByTestId('field-color').fill(writtenOff.color);
  await page.getByTestId('field-style').fill(writtenOff.style);
  await page.getByTestId('sale-next').click();
  await page.getByTestId('checkout-type-WRITEOFF').click();
  await page.getByTestId('writeoff-comment').fill('брак підошви');
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('toast-success')).toBeVisible();

  await page.goto('/my-sales');
  const writeoffRow = row('WRITEOFF', writtenOff);
  await expect(writeoffRow).toHaveCount(1);
  // Informational only: no money on the row…
  await expect(writeoffRow).toContainText('списання');
  await expect(writeoffRow).not.toContainText('₴');
  // …and the day's total is still just the one sale.
  await expect(page.getByText('2 400 ₴').first()).toBeVisible();
});

test('місячний режим гортається назад, але не в майбутнє (TC-F-03)', async () => {
  await page.goto('/my-sales');
  // The month tab is labelled with the month itself («Липень 2026»), so the
  // test id is the only stable handle.
  await page.getByTestId('my-sales-period-month').click();

  const next = page.getByRole('button', { name: 'Наступний місяць' });
  // Nothing can be sold in the future, so forward is closed on the current month.
  await expect(next).toBeDisabled();

  await page.getByRole('button', { name: 'Попередній місяць' }).click();
  await expect(next).toBeEnabled();
});

test('чернетку можна відредагувати (TC-F-04)', async () => {
  await page.goto('/my-drafts');
  await expect(page.getByTestId('draft-row')).toHaveCount(1);

  await page.getByTestId('draft-edit').click();
  const newStyle = uniqueStyle();
  await page.getByTestId('field-style').fill(newStyle);
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();

  await expect(page.getByTestId('draft-row')).toContainText(newStyle);
  draft.style = newStyle;
});

test('чернетку можна видалити з підтвердженням (TC-F-05)', async () => {
  await page.goto('/my-drafts');
  await page.getByTestId('draft-delete').click();

  // The dialog states the action is irreversible before it happens.
  await expect(page.getByText('Дію не можна скасувати')).toBeVisible();
  await page.getByRole('button', { name: 'Видалити', exact: true }).click();

  await expect(page.getByTestId('draft-row')).toHaveCount(0);
  await expect(page.getByText('У вас поки немає чернеток')).toBeVisible();
});

/** One row of «Мої продажі», pinned to a pair — the list holds several. */
function row(
  type: 'SALE' | 'RETURN' | 'WRITEOFF',
  tag: { size: string; color: string; style: string },
) {
  return page
    .getByTestId(`my-sales-row-${type}`)
    .filter({ hasText: `${tag.style} · ${tag.color} · р. ${tag.size}` });
}
