import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/SampleDB/);
});

test('Studies route', async ({ page }) => {
  await page.goto('/studies');

  await expect(page).toHaveURL(/\/(studies|login|setup)/, { timeout: 15_000 });

  if ((await page.url()).endsWith('/studies')) {
    await expect(page.getByRole('heading', { name: 'Studies' })).toBeVisible({ timeout: 10_000 });
  }
});
