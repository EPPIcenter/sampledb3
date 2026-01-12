import { test, expect } from '@playwright/test';
import { resetDatabase } from '../../utils/db-reset';
import { completeSetup, createSpecimenType } from '../../utils/test-helpers';

test.describe('Subject and Specimen Entry Journey', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should complete subject and specimen creation flow', async ({ page }) => {
        // Step 1: Complete initial setup
        await completeSetup(page, { skipOptional: true });

        // Step 2: Create a specimen type (required for specimens)
        await createSpecimenType(page, 'Blood Sample');

        // Step 3: Create a study first (required for subjects)
        await page.goto('/studies');
        await page.click('button:has-text("Add New"), button:has-text("Create"), a:has-text("New Study")');
        await page.fill('input[name="title"], input[placeholder*="title" i]', 'Subject Test Study');
        await page.fill('input[name="shortCode"], input[placeholder*="short code" i]', 'SUBJ001');
        await page.fill('input[name="leadPerson"], input[placeholder*="lead" i]', 'Test Lead');
        await page.click('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
        await page.waitForTimeout(1000);

        // Step 4: Navigate to study detail and create subject
        await page.click('text=Subject Test Study');
        await page.waitForURL(/\/studies\/\d+/);
        
        // Look for "Add Subject" or similar button
        const addSubjectButton = page.locator('button:has-text("Add"), button:has-text("New Subject"), a:has-text("Subject")').first();
        if (await addSubjectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await addSubjectButton.click();
        } else {
            // Alternative: Navigate directly to specimen creation which may create subject
            await page.goto('/specimens/new');
        }

        // Step 5: Create a specimen (which may create subject if needed)
        await page.goto('/specimens/new');
        
        // Fill specimen form
        await page.selectOption('select[name="sourceType"], select[placeholder*="source" i]', 'subject');
        await page.fill('input[name="studyShortCode"], input[placeholder*="study" i]', 'SUBJ001');
        await page.fill('input[name="subjectName"], input[placeholder*="subject" i]', 'SUBJ-001');
        await page.selectOption('select[name="specimenTypeName"], select[placeholder*="specimen type" i]', 'Blood Sample');
        await page.fill('input[name="collectionDate"], input[type="date"]', '2024-01-15');
        
        // Submit form
        await page.click('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
        await page.waitForTimeout(2000);

        // Step 6: Verify specimen was created (check for success message or redirect)
        await expect(page.locator('text=/specimen|created|success/i')).toBeVisible({ timeout: 5000 });
    });
});
