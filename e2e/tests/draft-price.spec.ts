import { expect, test } from '@playwright/test';

import { ADMIN, DASHBOARD_URL, manualIntake, scannerSignIn, uniqueStyle } from './helpers';

/**
 * S-15.3 — the draft→price chain across both apps: the admin creates a
 * seller in the dashboard, the seller drafts an intake in the scanner,
 * the admin prices it from the queue, the seller sees «НА СКЛАДІ».
 */
test('чернетка продавця отримує ціну від адміна через два застосунки', async ({ browser }) => {
  const seller = {
    name: 'Оля Тест',
    login: `olia-e2e-${Math.floor(Math.random() * 100000)}`,
    password: 'seller-e2e-pass1',
  };
  const tag = { size: '37', color: '21', style: uniqueStyle() };

  // 1. Dashboard (desktop): admin creates the seller.
  const dashboard = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await dashboard.goto(`${DASHBOARD_URL}/login`);
  await dashboard.getByTestId('login-input').fill(ADMIN.login);
  await dashboard.getByTestId('password-input').fill(ADMIN.password);
  await dashboard.getByTestId('login-submit').click();
  await dashboard.getByTestId('nav-users').click();
  await dashboard
    .getByRole('button', { name: /Додати/ })
    .first()
    .click();
  await dashboard.getByLabel("ІМ'Я").fill(seller.name);
  await dashboard.getByLabel('ЛОГІН').fill(seller.login);
  await dashboard.getByRole('textbox', { name: /ПАРОЛЬ/ }).fill(seller.password);
  await dashboard.getByRole('button', { name: 'Створити користувача' }).click();
  await expect(dashboard.getByText(`логін: ${seller.login}`)).toBeVisible();

  // 2. Scanner (mobile): the seller drafts an intake — no price section at all.
  const scanner = await browser.newPage({ viewport: { width: 393, height: 851 } });
  await scannerSignIn(scanner, seller.login, seller.password);
  await manualIntake(scanner, tag);
  await scanner.goto('/my-drafts');
  await expect(scanner.getByText(`${tag.style} · ${tag.color} · р. ${tag.size}`)).toBeVisible();
  await expect(scanner.getByText('ОЧІКУЄ ЦІНИ', { exact: true })).toBeVisible();

  // 3. Dashboard: the variant sits in the queue; the admin sets the price.
  await dashboard.getByTestId('nav-intake').click();
  const card = dashboard
    .locator('div')
    .filter({ hasText: new RegExp(`${tag.style}.*${tag.color}`) })
    .filter({ has: dashboard.getByTestId('queue-set-price') })
    .last();
  await card.getByTestId('queue-set-price').click();
  const priceInput = dashboard.getByTestId('price-modal-input');
  await priceInput.click();
  await priceInput.pressSequentially('32.5'); // $32.50 → 1 300 ₴
  const save = dashboard.getByTestId('price-modal-save');
  await expect(save).toBeEnabled();
  await save.click();

  // 4. Scanner: the draft flipped to «НА СКЛАДІ».
  await scanner.reload();
  await expect(scanner.getByText('НА СКЛАДІ', { exact: true })).toBeVisible();
  await expect(scanner.getByText('ОЧІКУЄ ЦІНИ', { exact: true })).not.toBeVisible();

  await dashboard.close();
  await scanner.close();
});
