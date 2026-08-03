import { expect, test, type Page } from '@playwright/test';

import {
  ADMIN,
  API,
  adminToken,
  bearer,
  dashboardSignIn,
  manualIntake,
  manualSale,
  scannerSignIn,
  seedSeller,
  uniqueStyle,
} from './helpers';

/**
 * Suite I — the stock screen: the table and its server-side search, the
 * variant drawer, a price change that applies to every pair of the variant,
 * deleting a pair, and cancelling a sale (FR-D-07) with the money moving back
 * out of the statistics.
 */

test.describe.configure({ mode: 'serial' });

let dashboard: Page;
let scanner: Page;
const style = uniqueStyle();
const first = { size: '42', color: '61', style };
const second = { size: '43', color: '61', style };

test.beforeAll(async ({ browser, request }) => {
  const seller = await seedSeller(request, 'stock');

  scanner = await browser.newPage({ viewport: { width: 393, height: 851 } });
  await scannerSignIn(scanner, ADMIN.login, ADMIN.password);
  // Two pairs of one variant: one stays on the shelf, one gets sold.
  await manualIntake(scanner, first, '30'); // $30 → 1 200 ₴
  await manualIntake(scanner, second, '30');
  await manualSale(scanner, second, '3000', 'CARD');

  dashboard = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await dashboardSignIn(dashboard, ADMIN.login, ADMIN.password);
  await dashboard.getByTestId('nav-stock').click();
  expect(seller.login).toBeTruthy();
});

test.afterAll(async () => {
  await dashboard.close();
  await scanner.close();
});

test('пошук по складу звужує таблицю до варіанта (TC-I-01, TC-I-02)', async () => {
  await dashboard.getByTestId('stock-search').fill(style);

  const rows = dashboard.getByTestId('stock-row');
  await expect(rows).toHaveCount(1);
  // The sold pair is gone from stock; only the remaining size shows.
  await expect(rows.first()).toContainText(first.size);
  await expect(rows.first()).not.toContainText(second.size);
  // Entered as $30, stored and shown as hryvnia — the books are in one currency.
  await expect(rows.first()).toContainText('1 200 ₴');
});

test('фільтр «Очікують ціни» ховає повністю оцінений варіант (TC-I-02)', async () => {
  await dashboard.getByTestId('stock-search').fill(style);
  await dashboard.getByTestId('filter-awaiting').click();

  await expect(dashboard.getByTestId('stock-row')).toHaveCount(0);

  await dashboard.getByTestId('filter-awaiting').click();
  await expect(dashboard.getByTestId('stock-row')).toHaveCount(1);
});

test('шухляда варіанта показує пари й історію руху (TC-I-03)', async () => {
  await dashboard.getByTestId('stock-search').fill(style);
  await dashboard.getByTestId('stock-row').first().click();

  await expect(dashboard.getByText('ПАРИ НА СКЛАДІ')).toBeVisible();
  await expect(dashboard.getByText('ІСТОРІЯ РУХУ')).toBeVisible();
  // The history keeps the sale even though the pair left the shelf.
  await expect(dashboard.getByText('3 000 ₴').first()).toBeVisible();
});

test('зміна ціни застосовується до всіх пар варіанта (TC-I-04)', async ({ request }) => {
  await dashboard.getByTestId('drawer-edit-price').first().click();

  const input = dashboard.getByTestId('price-modal-input');
  await input.click();
  await input.fill('');
  await input.pressSequentially('33.75'); // $33.75 → 1 350 ₴
  await dashboard.getByTestId('price-modal-save').click();

  const res = await request.get(`${API}/stock/variants?search=${style}`, {
    headers: bearer(await adminToken(request)),
  });
  const { items } = (await res.json()) as { items: { purchasePrice: number }[] };
  expect(items[0]?.purchasePrice).toBe(1350);
});

/**
 * FR-D-07: cancelling a sale is for one recorded in error — the pair returns
 * to stock and the revenue is recalculated. A customer return is the scanner's
 * job and a different operation entirely.
 */
test('скасування продажу повертає пару на склад (TC-I-06)', async ({ request }) => {
  await reopenDrawer();
  await dashboard.getByTestId('drawer-cancel-operation').first().click();
  await expect(dashboard.getByText('Скасувати продаж?')).toBeVisible();
  await dashboard.getByTestId('cancel-operation-confirm').click();

  // Both sizes are back on the shelf.
  const res = await request.get(`${API}/stock/variants?search=${style}`, {
    headers: bearer(await adminToken(request)),
  });
  const { items } = (await res.json()) as { items: { sizes: number[]; pairsCount: number }[] };
  expect(items[0]?.pairsCount).toBe(2);
  expect(items[0]?.sizes).toEqual(
    expect.arrayContaining([Number(first.size), Number(second.size)]),
  );
});

test('видалення пари прибирає її зі складу (TC-I-05)', async ({ request }) => {
  await reopenDrawer();

  await dashboard.getByTestId('drawer-delete-pair').first().click();
  await expect(dashboard.getByText('Дію не можна скасувати')).toBeVisible();
  await dashboard.getByTestId('delete-pair-confirm').click();

  const res = await request.get(`${API}/stock/variants?search=${style}`, {
    headers: bearer(await adminToken(request)),
  });
  const { items } = (await res.json()) as { items: { pairsCount: number }[] };
  expect(items[0]?.pairsCount).toBe(1);
});

/**
 * The drawer stays open after an action and its overlay swallows clicks on the
 * navigation, so a test that needs it fresh closes it first.
 */
async function reopenDrawer(): Promise<void> {
  await dashboard.keyboard.press('Escape');
  await dashboard.getByTestId('nav-stock').click();
  await dashboard.getByTestId('stock-search').fill(style);
  await dashboard.getByTestId('stock-row').first().click();
}
