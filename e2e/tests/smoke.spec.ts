import { expect, test } from '@playwright/test';

import { ADMIN, scannerSignIn } from './helpers';

// S-15.1 smoke: the stack is up and a login lands on the home hub.
test('логін відкриває головну сканера', async ({ page }) => {
  await scannerSignIn(page, ADMIN.login, ADMIN.password);
  await expect(page.getByTestId('today-summary')).toBeVisible();
  await expect(page.getByTestId('action-sale')).toBeVisible();
});
