import { expect, type Page } from '@playwright/test';

export { ADMIN, DASHBOARD_URL } from '../playwright.config';

/** Unique 4-digit style per call so scenarios never collide across runs. */
export function uniqueStyle(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Sign into the SCANNER (both roles may enter). Lands on the home hub. */
export async function scannerSignIn(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('ЛОГІН').fill(login);
  // The password label also wraps the eye-toggle button — target the textbox.
  await page.getByRole('textbox', { name: /ПАРОЛЬ/ }).fill(password);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: /Добрий/ })).toBeVisible();
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
  await page.getByRole('button', { name: 'Ввести вручну' }).click();
  await page.getByLabel('SIZE').fill(tag.size);
  await page.getByLabel('COLOR').fill(tag.color);
  await page.getByLabel('STYLE').fill(tag.style);
  if (purchasePrice != null) {
    await page.getByPlaceholder('Ціна').fill(purchasePrice);
  }
  await page.getByRole('button', { name: 'Зберегти й завершити' }).click();
  await expect(page.getByRole('heading', { name: /Добрий/ })).toBeVisible();
}

/** Manual checkout: /manual → tag fields → sale with price and payment. */
export async function manualSale(
  page: Page,
  tag: { size: string; color: string; style: string },
  salePrice: string,
  payment: 'Готівка' | 'Картка',
): Promise<void> {
  await page.goto('/manual');
  await page.getByLabel('SIZE').fill(tag.size);
  await page.getByLabel('COLOR').fill(tag.color);
  await page.getByLabel('STYLE').fill(tag.style);
  await page.getByRole('button', { name: 'Далі — деталі виходу' }).click();
  await page.getByPlaceholder('Ціна').fill(salePrice);
  await page.getByRole('button', { name: payment }).click();
  await page.getByRole('button', { name: /Підтвердити продаж/ }).click();
  await expect(page.getByText('Продаж зареєстровано')).toBeVisible();
}
