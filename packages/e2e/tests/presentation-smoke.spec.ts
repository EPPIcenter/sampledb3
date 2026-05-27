import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';

test.describe('Presentation smoke (authenticated)', () => {
  test('dashboard loads after login', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: 'Lab Overview' })).toBeVisible();
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('studies list shows heading and main content', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/studies');
    await expect(page).toHaveURL(/\/studies/);
    await expect(page.getByRole('heading', { name: /^studies$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('specimens list shows heading', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/specimens');
    await expect(page).toHaveURL(/\/specimens/);
    await expect(page.getByRole('heading', { name: /^specimens$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('settings page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('main, form').first()).toBeVisible({ timeout: 15_000 });
  });
});
