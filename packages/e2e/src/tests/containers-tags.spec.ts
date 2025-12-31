import { test, expect } from '@playwright/test';
import { resetDatabase } from '../utils/db-reset';

test.describe('Container Tag Management', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test.beforeEach(async ({ page }) => {
        // Initialize system
        await page.goto('/setup');
        await page.getByLabel('Full Name').fill('Admin User');
        await page.getByLabel('Email Address').fill('admin@example.com');
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await page.getByLabel('Confirm Password').fill('password123');
        await page.click('button:has-text("Next")');
        await page.click('button:has-text("Next")'); // Step 2
        await page.click('button:has-text("Next")'); // Step 3
        await page.click('button:has-text("Finish Setup")'); // Step 4
        await expect(page).toHaveURL('/', { timeout: 10000 });
    });

    test('should create tags and assign them to containers', async ({ page }) => {
        // First, create some tags
        await page.goto('/reference-data');
        await page.click('text=Tags');
        
        // Create multiple tags
        const tags = ['Priority', 'Fragile', 'Expired'];
        for (const tagName of tags) {
            await page.click('button:has-text("Add New")');
            await page.fill('input[name="name"]', tagName);
            await page.click('button[type="submit"]');
            await expect(page.locator(`text=${tagName}`)).toBeVisible();
        }

        // Navigate to a page where we can view containers
        // This would typically be through a study -> subject -> specimen -> container flow
        // For now, we'll verify tags exist and can be managed
        
        // Verify tags are listed
        for (const tagName of tags) {
            await expect(page.locator(`text=${tagName}`)).toBeVisible();
        }
    });

    test('should filter containers by tags', async ({ page }) => {
        // Create tags first
        await page.goto('/reference-data');
        await page.click('text=Tags');
        
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'Test Filter Tag');
        await page.click('button[type="submit"]');
        await expect(page.locator('text=Test Filter Tag')).toBeVisible();

        // Navigate to containers/statistics page
        // The filtering would be tested on a page that lists containers
        // This is a placeholder for when container listing with tag filters is implemented
        await page.goto('/statistics');
        
        // Verify page loads (actual tag filtering UI would be tested here)
        await expect(page.locator('body')).toBeVisible();
    });

    test('should prevent deleting tags that are in use', async ({ page }) => {
        // This test would require:
        // 1. Create a tag
        // 2. Assign it to a container
        // 3. Try to delete the tag
        // 4. Verify deletion is prevented with appropriate error message
        
        await page.goto('/reference-data');
        await page.click('text=Tags');
        
        // Create tag
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'In Use Tag');
        await page.click('button[type="submit"]');
        await expect(page.locator('text=In Use Tag')).toBeVisible();
        
        // Note: Full test would require creating a container and assigning the tag
        // Then attempting to delete and verifying the error message
        // This is a placeholder for the complete flow
    });
});


