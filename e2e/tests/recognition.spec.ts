import { expect, test, type Page } from '@playwright/test';

import { ADMIN, scannerSignIn } from './helpers';

/**
 * The recognition flows the 30.07.2026 manual run had to skip: an agent cannot
 * hold a phone to a shoe box, and the browser pane blocks camera access
 * (TC-B-07, TC-B-08, TC-D-08 in docs/manual-test-plan.md).
 *
 * Playwright covers both halves without a camera:
 *   • the gallery fallback accepts a real fixture photo via setInputFiles, so
 *     the whole capture → POST /tags/recognize → prefill path runs for real
 *     against the mock provider (VISION_PROVIDER=mock, deterministic numbers);
 *   • page.route() aborts the recognition request, which is the only honest
 *     way to reach the failure screen and prove «Ввести вручну» keeps the
 *     user inside the intake flow instead of dropping them into checkout.
 */

const LABEL_PHOTO = '../apps/scanner/test-assets/test_label.jpg';

/** Mock provider's fixed reading; see apps/api/src/tags/vision/mock.provider.ts. */
const RECOGNIZED = { size: '38', color: '36', style: '7645' } as const;

/**
 * One sign-in for the whole file, on purpose: `POST /auth/login` is throttled
 * to 10/min per IP, and with `workers: 1` every spec shares that budget. A
 * login per test here would starve the specs that run after this one.
 */
test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await scannerSignIn(page, ADMIN.login, ADMIN.password);
});

test.afterAll(async () => {
  await page.close();
});

test('скан бірки з галереї префілить форму поступлення (TC-B-07)', async () => {
  await page.goto('/intake');

  // Headless chromium has no camera, so the screen offers the file fallback —
  // the input is hidden behind a styled label, hence the direct locator.
  await page.getByTestId('tag-photo-input').setInputFiles(LABEL_PHOTO);

  await expect(page.getByTestId('intake-form')).toBeVisible();
  // The scanned size seeds the grid with one pair; there is no SIZE field.
  await expect(page.getByTestId(`size-qty-${RECOGNIZED.size}`)).toHaveValue('1');
  await expect(page.getByTestId('field-color')).toHaveValue(RECOGNIZED.color);
  await expect(page.getByTestId('field-style')).toHaveValue(RECOGNIZED.style);
  // confidence 0.99 — the "check the digits" warning must stay away.
  await expect(page.getByText(/Розпізнано невпевнено/)).toBeHidden();
});

test('збій розпізнавання лишає «Ввести вручну» всередині поступлення (TC-B-08)', async () => {
  await page.route('**/api/tags/recognize', (route) => route.abort());
  await page.goto('/intake');

  await page.getByTestId('tag-photo-input').setInputFiles(LABEL_PHOTO);
  await expect(page.getByText('Не вдалося прочитати бірку')).toBeVisible();

  // The escape hatch on the ERROR screen — a different button from the one on
  // the camera, and the one a seller actually reaches when recognition dies.
  await page.getByTestId('recognition-error-manual').click();

  // The intake form with EMPTY fields — not /manual, which is the checkout
  // flow: selling a pair is the opposite of receiving one (regression S-1.2).
  await expect(page.getByTestId('intake-form')).toBeVisible();
  await expect(page.getByTestId(`size-qty-${RECOGNIZED.size}`)).toHaveValue('');
  expect(new URL(page.url()).pathname).toBe('/intake');

  await page.unroute('**/api/tags/recognize');
});

test('скан у флоу продажу відкриває підтвердження скану (TC-D-08)', async () => {
  await page.goto('/sale');

  await page.getByTestId('tag-photo-input').setInputFiles(LABEL_PHOTO);

  await expect(page.getByText('Підтвердження скану')).toBeVisible();
  await expect(page.getByTestId('field-style')).toHaveValue(RECOGNIZED.style);
});
