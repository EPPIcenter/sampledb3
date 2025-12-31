import { test, expect } from '@playwright/test';
import { resetDatabase } from '../utils/db-reset';

test.describe('System Initialization', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should allow user to initialize the system', async ({ page }) => {
        // 1. Visit setup
        await page.goto('/setup');
        await expect(page.locator('text=Welcome to SampleDB')).toBeVisible();

        // 2. Step 1: Admin Account
        await page.getByLabel('Full Name').fill('Admin User');
        await page.getByLabel('Email Address').fill('admin@example.com');
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await page.getByLabel('Confirm Password').fill('password123');
        
        // Wait for Next button to be enabled (form validation)
        await expect(page.locator('button:has-text("Next")')).toBeEnabled({ timeout: 5000 });
        await page.click('button:has-text("Next")');

        // 3. Step 2: Core Definitions
        await expect(page.locator('text=Step 2 of 4').or(page.locator('text=Core Definitions'))).toBeVisible();
        // Check default exists
        await expect(page.locator('text=Blood')).toBeVisible();

        // Add custom Specimen Type
        const specimenInput = page.getByPlaceholder('e.g. Blood').first();
        await specimenInput.fill('TestSpecimen');
        // Press Enter to add
        await specimenInput.press('Enter');
        await expect(page.locator('text=TestSpecimen')).toBeVisible();

        // Verify required fields are present (units should have defaults)
        // Note: States have been removed - status is now derived from remainingQuantity
        await expect(page.locator('text=mL')).toBeVisible();

        await page.click('button:has-text("Next")');

        // 4. Step 3: Lab Infrastructure
        await expect(page.locator('text=Step 3 of 4').or(page.locator('text=Lab Infrastructure'))).toBeVisible();
        // Check default storage type (use first() to handle multiple matches)
        await expect(page.locator('text=Freezer -80°C').first()).toBeVisible();

        // Add Root Location
        await page.getByPlaceholder('e.g. Lab 101').fill('Main Lab');
        await page.locator('#newLocType').selectOption({ label: 'Room Temperature' });
        await page.click('button:has-text("Add")');
        await expect(page.locator('text=Main Lab').first()).toBeVisible();

        await page.click('button:has-text("Next")');

        // 5. Step 4: Biology
        await expect(page.locator('text=Biology (Optional)')).toBeVisible();

        // Add Strain
        await page.getByPlaceholder('Name (e.g. E. coli K12)').fill('TestStrain');
        await page.getByPlaceholder('Name (e.g. E. coli K12)').press('Enter');
        await expect(page.locator('text=TestStrain').first()).toBeVisible();

        // Finish
        await page.click('button:has-text("Finish Setup")');

        // 6. Should redirect to Dashboard
        await expect(page).toHaveURL('/', { timeout: 10000 });
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

        // 7. Verify Data Exists
        // We verify via UI if possible. 
        // If /reference-data exists and shows types:
        await page.goto('/reference-data');
        await expect(page.locator('text=TestSpecimen').first()).toBeVisible();
    });
});
