import { expect, test, type Page } from '@playwright/test';

import {
  ADMIN,
  API,
  adminToken,
  bearer,
  dashboardSignIn,
  manualSale,
  scannerSignIn,
  seedSeller,
  uniqueStyle,
} from './helpers';

/**
 * Suite H — the admin overview: KPIs over the real numbers, the period
 * switcher, the operations feed, and the realtime push that moves all three
 * when a seller scans something in the shop (FR-B-04).
 */

test.describe.configure({ mode: 'serial' });

let dashboard: Page;
let scanner: Page;
let seller: Awaited<ReturnType<typeof seedSeller>>;
const tag = { size: '39', color: '51', style: uniqueStyle() };

test.beforeAll(async ({ browser, request }) => {
  seller = await seedSeller(request, 'overview');
  // A priced pair the seller can sell: intake as the seller, price as the admin.
  const intake = await request.post(`${API}/intake`, {
    headers: bearer(seller.token),
    data: { size: Number(tag.size), color: tag.color, style: tag.style },
  });
  const { variantId } = (await intake.json()) as { variantId: string };
  await request.patch(`${API}/stock/variants/${variantId}/price`, {
    headers: bearer(await adminToken(request)),
    data: { purchasePriceUsd: 25 }, // $25 → 1 000 ₴
  });

  dashboard = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await dashboardSignIn(dashboard, ADMIN.login, ADMIN.password);

  scanner = await browser.newPage({ viewport: { width: 393, height: 851 } });
  await scannerSignIn(scanner, seller.login, seller.password);
});

test.afterAll(async () => {
  await dashboard.close();
  await scanner.close();
});

test('KPI-картки показують виручку, продано, маржу й чергу (TC-H-01)', async () => {
  await expect(dashboard.getByTestId('kpi-revenue')).toContainText('₴');
  await expect(dashboard.getByTestId('kpi-sold')).toContainText(/продаж|продажі|продажів/);
  await expect(dashboard.getByTestId('kpi-margin')).toContainText('₴');
  await expect(dashboard.getByTestId('kpi-awaiting')).toContainText(/пар|пари/);
});

// BUG-1 of the 30.07.2026 run: the sign lived in the translation, so a drop
// rendered as «+-100%» — in green.
test('дельта виручки не має подвійного знака (TC-H-01)', async () => {
  const delta = dashboard.getByTestId('kpi-revenue-delta');
  if (await delta.isVisible()) {
    await expect(delta).not.toContainText('+-');
  }
});

test('перемикач періодів змінює заголовок графіка (TC-H-02)', async () => {
  await dashboard.getByTestId('period-week').click();
  await expect(dashboard.getByText('Виручка за тиждень')).toBeVisible();

  await dashboard.getByTestId('period-month').click();
  await expect(dashboard.getByText('Виручка за місяць')).toBeVisible();

  await dashboard.getByTestId('period-today').click();
  await expect(dashboard.getByText('Виручка за сьогодні')).toBeVisible();
});

/**
 * The realtime contract: the scanner's sale reaches the dashboard without a
 * reload. The event carries no data — the dashboard refetches its normal
 * authorized endpoints — so this also proves the socket is not a way around
 * FR-B-02.
 */
test('продаж у сканері рухає стрічку дашборда без перезавантаження (TC-H-04)', async () => {
  const feed = dashboard.getByTestId('operations-feed');
  // The feed already lists this pair's intake, so the assertion has to be
  // about the SALE line specifically.
  const saleLine = new RegExp(`${tag.style} · ${tag.color} · р. ${tag.size} — продаж`);
  await expect(feed).not.toContainText(saleLine);

  await manualSale(scanner, tag, '2600', 'CARD');

  // No reload anywhere: the socket event makes the dashboard refetch.
  await expect(feed).toContainText(saleLine, { timeout: 15_000 });
});
