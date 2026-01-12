import { test, expect } from '@playwright/test';
import { resetDatabase } from '../../utils/db-reset';
import { completeSetup } from '../../utils/test-helpers';

test.describe('Study Management Journey', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should complete full study creation and management flow', async ({ page }) => {
        // Step 1: Complete initial setup
        await completeSetup(page, { skipOptional: true });

        // Step 2: Navigate to studies page
        await page.goto('/studies');
        await expect(page.locator('h1, h2')).toContainText(/studies/i);

        // Step 3: Create a new study
        await page.click('button:has-text("Add New"), button:has-text("Create"), a:has-text("New Study")');
        
        // Fill study form
        await page.fill('input[name="title"], input[placeholder*="title" i]', 'E2E Test Study');
        await page.fill('input[name="shortCode"], input[placeholder*="short code" i]', 'E2E001');
        await page.fill('input[name="leadPerson"], input[placeholder*="lead" i]', 'Test Lead');
        
        // Submit form
        await page.click('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
        
        // Wait for redirect or success message
        await page.waitForTimeout(1000);
        
        // Step 4: Verify study appears in list
        await expect(page.locator('text=E2E Test Study')).toBeVisible({ timeout: 5000 });

        // Step 5: Click on study to view details
        await page.click('text=E2E Test Study');
        await expect(page).toHaveURL(/\/studies\/\d+/);

        // Step 6: Verify study details page
        await expect(page.locator('text=E2E Test Study')).toBeVisible();
        await expect(page.locator('text=E2E001')).toBeVisible();
    });
});
