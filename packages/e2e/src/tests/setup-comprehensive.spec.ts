import { test, expect } from '@playwright/test';
import { resetDatabase } from '../utils/db-reset';

test.describe('Comprehensive Setup Flow', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should complete full setup with all optional fields', async ({ page }) => {
        // 1. Visit setup
        await page.goto('/setup');
        await expect(page.locator('text=Welcome to SampleDB')).toBeVisible();

        // 2. Step 1: Admin Account
        await page.getByLabel('Full Name').fill('Test Admin');
        await page.getByLabel('Email Address').fill('admin@test.com');
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await page.getByLabel('Confirm Password').fill('password123');
        
        // Verify Next button is enabled
        const nextButton = page.locator('button:has-text("Next")');
        await expect(nextButton).toBeEnabled();
        await nextButton.click();

        // 3. Step 2: Core Definitions
        await expect(page.locator('text=Step 2: Core Definitions')).toBeVisible();
        
        // Verify defaults are present
        await expect(page.locator('text=Blood')).toBeVisible();
        await expect(page.locator('text=mL')).toBeVisible();
        
        // Add custom specimen type
        const specimenInput = page.getByPlaceholder('e.g. Blood').first();
        await specimenInput.fill('Custom Specimen');
        await specimenInput.press('Enter');
        await expect(page.locator('text=Custom Specimen')).toBeVisible();
        
        // Add custom unit
        const unitNameInput = page.getByPlaceholder('Name (e.g. Milliliter)');
        await unitNameInput.fill('Custom Unit');
        const unitSymbolInput = page.getByPlaceholder('Symbol (e.g. mL)');
        await unitSymbolInput.fill('cu');
        const unitCategoryInput = page.getByPlaceholder('Category (e.g. volume)');
        await unitCategoryInput.fill('custom');
        await unitCategoryInput.press('Enter');
        await expect(page.locator('text=Custom Unit')).toBeVisible();
        
        await page.click('button:has-text("Next")');

        // 4. Step 3: Lab Infrastructure
        await expect(page.locator('text=Step 3: Lab Infrastructure')).toBeVisible();
        
        // Verify default storage types
        await expect(page.locator('text=Freezer -80°C')).toBeVisible();
        
        // Add custom storage type
        const storageNameInput = page.getByPlaceholder('Name (e.g. -80 Freezer)');
        await storageNameInput.fill('Custom Freezer');
        const storageDescInput = page.getByPlaceholder('Description');
        await storageDescInput.fill('Custom freezer description');
        await storageDescInput.press('Enter');
        await expect(page.locator('text=Custom Freezer')).toBeVisible();
        
        // Add root location
        await page.getByPlaceholder('e.g. Lab 101').fill('Test Lab');
        await page.locator('#newLocType').selectOption({ label: 'Room Temperature' });
        await page.click('button:has-text("Add")');
        await expect(page.locator('text=Test Lab')).toBeVisible();
        
        await page.click('button:has-text("Next")');

        // 5. Step 4: Biology (Optional)
        await expect(page.locator('text=Step 4: Biology (Optional)')).toBeVisible();
        
        // Add strain
        await page.getByPlaceholder('Name (e.g. E. coli K12)').fill('Test Strain');
        await page.getByPlaceholder('Name (e.g. E. coli K12)').press('Enter');
        await expect(page.locator('text=Test Strain')).toBeVisible();
        
        // Compositions are no longer used - strain data is now embedded in control definitions via properties JSON
        // For now, we'll just verify the step is accessible
        
        // Finish setup
        await page.click('button:has-text("Finish Setup")');

        // 6. Verify redirect to Dashboard
        await expect(page).toHaveURL('/', { timeout: 10000 });
        await expect(page.locator('text=Dashboard').or(page.locator('h1'))).toBeVisible();

        // 7. Verify data was saved by checking Reference Data page
        await page.goto('/reference-data');
        
        // Check specimen types
        await expect(page.locator('text=Custom Specimen')).toBeVisible();
        
        // Check units
        await page.click('text=Units');
        await expect(page.locator('text=Custom Unit')).toBeVisible();
        
        // Check storage types
        await page.click('text=Storage Types');
        await expect(page.locator('text=Custom Freezer')).toBeVisible();
    });

    test('should validate required fields in each step', async ({ page }) => {
        await page.goto('/setup');

        // Step 1: Try to proceed without filling required fields
        const nextButton = page.locator('button:has-text("Next")');
        await expect(nextButton).toBeDisabled();

        // Fill only name - should still be disabled
        await page.getByLabel('Full Name').fill('Test');
        await expect(nextButton).toBeDisabled();

        // Fill email - should still be disabled (needs password)
        await page.getByLabel('Email Address').fill('test@test.com');
        await expect(nextButton).toBeDisabled();

        // Fill password but too short - should still be disabled
        await page.getByLabel('Password', { exact: true }).fill('short');
        await expect(nextButton).toBeDisabled();

        // Fill valid password but no confirmation - should still be disabled
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await expect(nextButton).toBeDisabled();

        // Fill matching confirmation - should be enabled
        await page.getByLabel('Confirm Password').fill('password123');
        await expect(nextButton).toBeEnabled();
    });

    test('should prevent password mismatch', async ({ page }) => {
        await page.goto('/setup');

        await page.getByLabel('Full Name').fill('Test Admin');
        await page.getByLabel('Email Address').fill('admin@test.com');
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await page.getByLabel('Confirm Password').fill('different123');

        // Next button should be disabled
        const nextButton = page.locator('button:has-text("Next")');
        await expect(nextButton).toBeDisabled();
    });

    test('should allow navigation back and forth between steps', async ({ page }) => {
        await page.goto('/setup');

        // Complete step 1
        await page.getByLabel('Full Name').fill('Test Admin');
        await page.getByLabel('Email Address').fill('admin@test.com');
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await page.getByLabel('Confirm Password').fill('password123');
        await page.click('button:has-text("Next")');

        // Should be on step 2
        await expect(page.locator('text=Step 2: Core Definitions')).toBeVisible();

        // Go back
        await page.click('button:has-text("Back")');

        // Should be back on step 1
        await expect(page.locator('text=Step 1: Admin Account')).toBeVisible();

        // Data should be preserved
        await expect(page.getByLabel('Full Name')).toHaveValue('Test Admin');
    });
});


