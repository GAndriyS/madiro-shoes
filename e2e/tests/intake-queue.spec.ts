import { expect, test, type Page } from '@playwright/test';

import {
  ADMIN,
  API,
  adminToken,
  bearer,
  dashboardSignIn,
  seedSeller,
  uniqueStyle,
} from './helpers';

/**
 * Suite C of docs/manual-test-plan.md — the awaiting-price queue: a seller's
 * draft appears, the admin prices it or marks it old stock, and the variant
 * leaves the queue. Fixtures are made through the API so the spec owns its
 * data instead of leaning on the demo seed.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
const priced = { size: 37, color: '11', style: uniqueStyle() };
const oldStock = { size: 38, color: '12', style: uniqueStyle() };

test.beforeAll(async ({ browser, request }) => {
  const seller = await seedSeller(request, 'queue');
  // Only a seller can create a draft: an admin always decides the price.
  for (const tag of [priced, oldStock]) {
    const res = await request.post(`${API}/intake`, { headers: bearer(seller.token), data: tag });
    expect(res.ok(), `intake ${tag.style}: ${res.status()}`).toBeTruthy();
  }

  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await dashboardSignIn(page, ADMIN.login, ADMIN.password);
});

test.afterAll(async () => {
  await page.close();
});

test('черга показує чернетки продавця з бейджем у навігації (TC-C-01)', async () => {
  await page.getByTestId('nav-intake').click();

  await expect(queueCard(priced.style)).toBeVisible();
  await expect(queueCard(oldStock.style)).toBeVisible();
  // The nav renders the badge twice — a compact one for narrow screens and the
  // sidebar one — so take the desktop variant at this viewport.
  await expect(page.getByTestId('nav-queue-badge').last()).toBeVisible();
});

test('вказати ціну: варіант залишає чергу, ціна застосована (TC-C-02)', async ({ request }) => {
  await page.getByTestId('nav-intake').click();
  await queueCard(priced.style).getByTestId('queue-set-price').click();

  const input = page.getByTestId('price-modal-input');
  await input.click();
  await input.pressSequentially('47.5'); // $47.50 → 1 900 ₴
  await page.getByTestId('price-modal-save').click();

  await expect(queueCard(priced.style)).toBeHidden();
  await expect(await variantRow(request, priced.style)).toMatchObject({
    purchasePrice: 1900,
    awaitingPriceCount: 0,
  });
});

test('«без ціни — старий товар»: підтвердження наслідків і ціна 0 (TC-C-03)', async ({
  request,
}) => {
  await page.getByTestId('nav-intake').click();
  await queueCard(oldStock.style).getByTestId('queue-no-price').click();

  // The consequence is spelled out before anything is written.
  await expect(page.getByText('Лишити без вхідної ціни?')).toBeVisible();
  await page.getByTestId('no-price-confirm').click();

  await expect(queueCard(oldStock.style)).toBeHidden();
  // 0, not null: a decision, not an absence (spec §2.2 #4).
  await expect(await variantRow(request, oldStock.style)).toMatchObject({ purchasePrice: 0 });
});

test('історія поступлень містить обидві підтверджені партії (TC-C-04)', async () => {
  await page.getByTestId('nav-intake').click();

  const history = page
    .locator('div')
    .filter({ hasText: /^ІСТОРІЯ ПОСТУПЛЕНЬ/ })
    .last();
  await expect(history).toContainText(priced.style);
  await expect(history).toContainText('1 900 ₴');
  await expect(history).toContainText(oldStock.style);
});

/** The queue card for a style — the one that still offers the price action. */
function queueCard(style: string) {
  return page
    .locator('div')
    .filter({ hasText: new RegExp(`^${style} · колір`) })
    .filter({ has: page.getByTestId('queue-set-price') })
    .last();
}

async function variantRow(
  request: Parameters<typeof adminToken>[0],
  style: string,
): Promise<{ purchasePrice: number | null; awaitingPriceCount: number }> {
  const res = await request.get(`${API}/stock/variants?search=${style}`, {
    headers: bearer(await adminToken(request)),
  });
  const { items } = (await res.json()) as {
    items: { purchasePrice: number | null; awaitingPriceCount: number }[];
  };
  expect(items, `variant ${style} not found`).not.toHaveLength(0);
  return items[0]!;
}
