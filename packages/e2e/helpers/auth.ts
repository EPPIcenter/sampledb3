import { expect, type Page } from '@playwright/test';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './e2e-seed';

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#emailOrUsername').fill(E2E_ADMIN_EMAIL);
  await page.locator('#password').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Lab Overview' })).toBeVisible({ timeout: 25_000 });
}
