import { test, expect } from '@playwright/test';

test.beforeAll(async ({ request }) => {
  const maxAttempts = 30;
  const delayMs = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await request.get('/api');
      if (res.ok()) return;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('API at /api did not become ready in time');
});

test('login page loads and shows sign-in form', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /sign in|log in|login/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('textbox', { name: /email|username/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible();
});

test('home route loads and shows dashboard, login, or setup', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SampleDB/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/(login|setup)?(\/)?$/, { timeout: 15000 });
  const main = page.getByRole('main').or(page.locator('form')).or(page.getByRole('heading').first());
  await expect(main).toBeVisible({ timeout: 10000 });
});
