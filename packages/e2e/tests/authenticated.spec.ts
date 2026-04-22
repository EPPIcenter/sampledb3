import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';

/** One worker avoids hammering /api/auth/login in parallel during local runs */
test.describe.configure({ mode: 'serial' });

test.describe('Authenticated flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('dashboard shows Lab Overview', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Lab Overview' })).toBeVisible();
  });

  test('Studies page loads', async ({ page }) => {
    await page.goto('/studies');
    await expect(page).toHaveURL(/\/studies/);
    await expect(page.getByRole('heading', { name: 'Studies' })).toBeVisible({ timeout: 15_000 });
  });

  test('Specimens page loads', async ({ page }) => {
    await page.goto('/specimens');
    await expect(page).toHaveURL(/\/specimens/);
    await expect(page.getByRole('heading', { name: 'Specimens' })).toBeVisible({ timeout: 15_000 });
  });

  test('Locations page loads', async ({ page }) => {
    await page.goto('/locations');
    await expect(page).toHaveURL(/\/locations/);
    await expect(page.getByRole('heading', { name: 'Storage Locations' })).toBeVisible({ timeout: 15_000 });
  });

  test('sidebar includes navigation to Studies', async ({ page }) => {
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Studies' })).toBeVisible({
      timeout: 10_000,
    });
  });
});
