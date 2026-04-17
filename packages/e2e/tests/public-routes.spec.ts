import { test, expect } from '@playwright/test';

test.describe('Public routes (unauthenticated)', () => {
  test('register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible({ timeout: 10_000 });
  });

  test('API root returns service metadata', async ({ request }) => {
    const res = await request.get('/api');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { message?: string; version?: string };
    expect(body.message).toMatch(/SampleDB/);
    expect(body.version).toBeDefined();
  });
});
