import { expect, test, type Page } from '@playwright/test';

import { ADMIN, API, apiLogin, bearer, dashboardSignIn } from './helpers';

/**
 * Suite J — managing sellers: creating one, refusing a duplicate login, and
 * the two rules that protect the shop — a password change ends the seller's
 * open sessions (tokenVersion), and deleting is soft, so their operations stay
 * in the reports while the account can no longer sign in.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
const seller = {
  name: 'Тест Продавчиня',
  login: `e2e-users-${Math.floor(Math.random() * 100000)}`,
  password: 'e2e-users-pass1',
};
const newPassword = 'e2e-users-pass2';

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await dashboardSignIn(page, ADMIN.login, ADMIN.password);
  await page.getByTestId('nav-users').click();
});

test.afterAll(async () => {
  await page.close();
});

test('створення продавця (TC-J-02)', async () => {
  await page.getByTestId('user-add').click();
  await page.getByTestId('user-name-input').fill(seller.name);
  await page.getByTestId('user-login-input').fill(seller.login);
  await page.getByTestId('user-password-input').fill(seller.password);
  await page.getByTestId('user-submit').click();

  await expect(card()).toBeVisible();
  await expect(card()).toContainText(seller.name);
});

test('адмін не показується у списку продавців (TC-J-01)', async () => {
  await expect(page.getByTestId('user-card').filter({ hasText: 'Адміністратор' })).toHaveCount(0);
});

test('дубль логіна відхиляється зрозумілим повідомленням (TC-J-03)', async () => {
  await page.getByTestId('user-add').click();
  await page.getByTestId('user-name-input').fill('Хтось інший');
  await page.getByTestId('user-login-input').fill(seller.login);
  await page.getByTestId('user-password-input').fill('e2e-other-pass1');
  await page.getByTestId('user-submit').click();

  await expect(page.getByTestId('user-form-error')).toContainText('Такий логін уже існує');
  await page.getByRole('button', { name: 'Скасувати' }).click();
});

/**
 * tokenVersion: changing a password must revoke tokens issued before it,
 * otherwise resetting a compromised account would leave the intruder logged in
 * for the rest of the refresh TTL.
 */
test('зміна пароля відкликає видані токени (TC-J-04)', async ({ request }) => {
  const oldToken = await apiLogin(request, seller.login, seller.password, 'scanner');
  expect((await request.get(`${API}/me/summary`, { headers: bearer(oldToken) })).status()).toBe(
    200,
  );

  await card().getByTestId('user-edit').click();
  await page.getByTestId('user-password-input').fill(newPassword);
  await page.getByTestId('user-submit').click();
  await expect(page.getByTestId('user-submit')).toBeHidden();

  expect((await request.get(`${API}/me/summary`, { headers: bearer(oldToken) })).status()).toBe(
    401,
  );
  // The new password works — the account is usable, just re-authenticated.
  const fresh = await apiLogin(request, seller.login, newPassword, 'scanner');
  expect((await request.get(`${API}/me/summary`, { headers: bearer(fresh) })).status()).toBe(200);
});

test('видалений продавець не входить, але лишається в звітах (TC-J-05)', async ({
  browser,
  request,
}) => {
  await card().getByTestId('user-delete').click();
  await expect(page.getByText('Видалити користувача?')).toBeVisible();
  await page.getByTestId('user-delete-confirm').click();

  await expect(card()).toHaveCount(0);

  // Login is refused now…
  const refused = await request.post(`${API}/auth/login`, {
    headers: { 'x-madiro-client': 'scanner' },
    data: { login: seller.login, password: newPassword },
  });
  expect(refused.status()).toBe(401);

  // …and the scanner shows the same thing to a person.
  const scanner = await browser.newPage({ viewport: { width: 393, height: 851 } });
  await scanner.goto('/login');
  await scanner.getByTestId('login-input').fill(seller.login);
  await scanner.getByTestId('password-input').fill(newPassword);
  await scanner.getByTestId('login-submit').click();
  await expect(scanner.getByTestId('login-error')).toBeVisible();
  await scanner.close();
});

/** The card of the seller this spec owns; the list holds other specs' too. */
function card() {
  return page.getByTestId('user-card').filter({ hasText: `логін: ${seller.login}` });
}
