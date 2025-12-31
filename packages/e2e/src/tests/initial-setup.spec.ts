import { test, expect } from '@playwright/test';
import { resetDatabase } from '../utils/db-reset';

test.describe('Initial Setup', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should load the home page with empty state', async ({ page }) => {
        // Navigate to home
        await page.goto('/');

        // Check title or main heading
        await expect(page).toHaveTitle(/SampleDB/);

        // Check if we are redirected to login or setup?
        // For now, let's just screenshot the landing state
        await page.screenshot({ path: 'test-results/initial-state.png' });

        // Only asserting that the app loads for now
        await expect(page.locator('body')).toBeVisible();
    });
});
