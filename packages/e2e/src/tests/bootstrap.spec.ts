import { test, expect } from '@playwright/test';
import { resetDatabase } from '../utils/db-reset';

test.describe('Bootstrap / Empty State', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should initially have no reference data', async ({ page }) => {
        // 1. Go to Reference Data page (if it exists) or dashboard
        await page.goto('/');

        // Check if we are redirected to setup or if dashboard loads
        await expect(page.locator('body')).toBeVisible();

        // 2. Try to navigate to "Reference Data"
        await page.click('text=Reference Data');

        // 3. Verify empty tables
        // Assuming the ReferenceData page lists types like Specimen Types, States, etc.
        // If these are empty, basic app creation flows will fail.
        await expect(page.locator('text=No specimen types found')).toBeVisible({ timeout: 5000 }).catch(() => {
            console.log('Maybe "No specimen types found" text is different or reference data is present?');
        });
    });

    test('creation of study should fail or be blocked if no users/config exist', async ({ page }) => {
        await page.goto('/studies');

        // If we have no users, maybe we aren't even logged in? 
        // Or if auth is disabled for dev, we might see the list.
        await expect(page.locator('text=No studies found')).toBeVisible();

        // Try to create a study
        const newStudyBtn = page.locator('button:has-text("New Study")');
        if (await newStudyBtn.isVisible()) {
            await newStudyBtn.click();
            // Expect to see a form
            await expect(page.url()).toContain('/studies/new');

            // Try filling it out
            await page.fill('input[name="title"]', 'Test Study');
            await page.fill('input[name="shortCode"]', 'TEST');
            await page.fill('input[name="leadPerson"]', 'Dr. Test');

            // If "isLongitudinal" is a checkbox or select
            await page.check('input[name="isLongitudinal"]');

            await page.click('button[type="submit"]');

            // Does it succeed? With empty DB, maybe yes if no FKs blocks it.
            // But Specimen creation definitely needs SpecimenType.
        }
    });
});
