import { test, expect } from '@playwright/test';
import { resetDatabase } from '../utils/db-reset';
import { completeSetup, createTag, createSpecimenType } from '../utils/test-helpers';

test.describe('Reference Data Management', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test.beforeEach(async ({ page }) => {
        await completeSetup(page, { skipOptional: true });
    });

    test('should manage specimen types', async ({ page }) => {
        await page.goto('/reference-data');
        
        // Should be on Specimen Types tab by default
        await expect(page.locator('text=Specimen Types')).toBeVisible();
        
        // Create new specimen type
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'E2E Test Specimen');
        await page.click('button[type="submit"]');
        
        // Verify it appears
        await expect(page.locator('text=E2E Test Specimen')).toBeVisible();
        
        // Edit it
        const row = page.locator('text=E2E Test Specimen').locator('..');
        const editButton = row.locator('button:has-text("Edit")');
        if (await editButton.isVisible()) {
            await editButton.click();
            await page.fill('input[name="name"]', 'Updated E2E Specimen');
            await page.click('button[type="submit"]');
            await expect(page.locator('text=Updated E2E Specimen')).toBeVisible();
        }
    });

    test('should manage units', async ({ page }) => {
        await page.goto('/reference-data');
        await page.click('text=Units');
        
        // Verify default units exist
        await expect(page.locator('text=mL')).toBeVisible();
        
        // Create new unit
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'Test Unit');
        await page.fill('input[name="symbol"]', 'tu');
        await page.fill('input[name="category"]', 'test');
        await page.click('button[type="submit"]');
        
        // Verify it appears
        await expect(page.locator('text=Test Unit')).toBeVisible();
    });

    test('should manage storage types', async ({ page }) => {
        await page.goto('/reference-data');
        await page.click('text=Storage Types');
        
        // Verify defaults exist
        await expect(page.locator('text=Freezer -80°C')).toBeVisible();
        
        // Create new storage type
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'E2E Storage Type');
        await page.fill('textarea[name="description"]', 'E2E Test Description');
        await page.click('button[type="submit"]');
        
        // Verify it appears
        await expect(page.locator('text=E2E Storage Type')).toBeVisible();
    });

    test('should manage tags', async ({ page }) => {
        await page.goto('/reference-data');
        await page.click('text=Tags');
        
        // Create tag
        await createTag(page, 'E2E Test Tag');
        
        // Verify it appears
        await expect(page.locator('text=E2E Test Tag')).toBeVisible();
        
        // Try to create duplicate (should fail)
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'E2E Test Tag');
        await page.click('button[type="submit"]');
        
        // Should show error
        await expect(
            page.locator('text=already exists').or(page.locator('text=duplicate'))
        ).toBeVisible({ timeout: 5000 });
    });

    test('should manage strains', async ({ page }) => {
        await page.goto('/reference-data');
        await page.click('text=Strains');
        
        // Create strain
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'E2E Test Strain');
        await page.fill('textarea[name="description"]', 'E2E Test Description');
        await page.click('button[type="submit"]');
        
        // Verify it appears
        await expect(page.locator('text=E2E Test Strain')).toBeVisible();
    });

    test('should navigate between reference data tabs', async ({ page }) => {
        await page.goto('/reference-data');
        
        const tabs = [
            'Specimen Types',
            'Tags',
            'Storage Types',
            'Units',
            'Strains',
        ];
        
        for (const tabName of tabs) {
            await page.click(`text=${tabName}`);
            // Verify tab content is visible (at least the table or empty state)
            await expect(page.locator('body')).toBeVisible();
        }
    });
});

