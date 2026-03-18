import { expect, test } from '@playwright/test';

test.describe('Auth Routing Smoke', () => {
  test('home redirects unauthenticated users to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('dashboard routes redirect unauthenticated users to sign-in', async ({ page }) => {
    await page.goto('/audits/new');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
