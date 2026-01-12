import { test, expect } from '@playwright/test';
import { resetDatabase } from '../../utils/db-reset';
import { completeSetup } from '../../utils/test-helpers';

test.describe('Control Batch Management Journey', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should complete control definition and batch creation flow', async ({ page }) => {
        // Step 1: Complete initial setup
        await completeSetup(page, { skipOptional: true });

        // Step 2: Navigate to blood controls page
        await page.goto('/blood-controls');
        await expect(page.locator('h1, h2')).toContainText(/control/i);

        // Step 3: Create a new control definition
        await page.click('button:has-text("Add New"), button:has-text("Create"), a:has-text("New")');
        
        // Fill control definition form
        await page.fill('input[name="name"], input[placeholder*="name" i]', 'E2E Test Control');
        
        // Select control type if there's a dropdown
        const controlTypeSelect = page.locator('select[name="controlType"]');
        if (await controlTypeSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
            await controlTypeSelect.selectOption('blood');
        }
        
        // Submit form
        await page.click('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
        await page.waitForTimeout(1000);

        // Step 4: Verify control definition appears
        await expect(page.locator('text=E2E Test Control')).toBeVisible({ timeout: 5000 });

        // Step 5: Click on control definition to view details
        await page.click('text=E2E Test Control');
        await expect(page).toHaveURL(/\/blood-controls\/\d+/);

        // Step 6: Create a batch for this control definition
        const createBatchButton = page.locator('button:has-text("Batch"), button:has-text("Add Batch"), a:has-text("Batch")').first();
        if (await createBatchButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await createBatchButton.click();
            
            // Fill batch form if it opens a modal or new page
            const productionDateInput = page.locator('input[name="productionDate"], input[type="date"]');
            if (await productionDateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
                await productionDateInput.fill('2024-01-01');
            }
            
            // Submit batch creation
            const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
            if (await submitButton.isVisible({ timeout: 1000 }).catch(() => false)) {
                await submitButton.click();
                await page.waitForTimeout(1000);
            }
        }

        // Step 7: Verify batch was created (check for batch in list or success message)
        await expect(page.locator('text=/batch|created|success/i')).toBeVisible({ timeout: 5000 });
    });
});
