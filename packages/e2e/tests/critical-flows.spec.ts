import { test, expect } from '@playwright/test';

test('login page loads and shows sign-in form', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /sign in|log in|login/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('textbox', { name: /email|username/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible();
});

test('home route loads and shows dashboard, login, or setup', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SampleDB/, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/(login|setup)?(\/)?$/, { timeout: 15_000 });
  await expect(page.locator('main, form').first()).toBeVisible({ timeout: 10_000 });
});
