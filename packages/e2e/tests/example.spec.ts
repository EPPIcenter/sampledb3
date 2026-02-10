import { test, expect } from '@playwright/test';

// Wait for the API (proxied at /api) to be ready before running tests.
// Playwright's webServer already waits for the frontend; this ensures the backend is up too.
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

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/SampleDB/);
});

test('Studies route', async ({ page }) => {
  // Navigate to /studies. When the app is not set up or not logged in,
  // we get redirected to /setup or /login; when authenticated we see the Studies page.
  await page.goto('/studies');

  // Wait for navigation to settle (studies page or auth redirect).
  await expect(page).toHaveURL(/\/(studies|login|setup)/, { timeout: 15000 });

  if ((await page.url()).endsWith('/studies')) {
    await expect(page.getByRole('heading', { name: 'Studies' })).toBeVisible({ timeout: 10000 });
  }
});
