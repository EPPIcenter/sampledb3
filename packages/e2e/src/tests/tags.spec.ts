import { test, expect } from '@playwright/test';
import { resetDatabase } from '../utils/db-reset';

test.describe('Tag Management', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test.beforeEach(async ({ page }) => {
        // Navigate to setup and initialize system
        await page.goto('/setup');
        
        // Quick setup - just admin account
        await page.getByLabel('Full Name').fill('Admin User');
        await page.getByLabel('Email Address').fill('admin@example.com');
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await page.getByLabel('Confirm Password').fill('password123');
        await page.click('button:has-text("Next")');
        
        // Step 2: Accept defaults
        await page.click('button:has-text("Next")');
        
        // Step 3: Accept defaults
        await page.click('button:has-text("Next")');
        
        // Step 4: Skip optional biology
        await page.click('button:has-text("Finish Setup")');
        
        // Wait for redirect to dashboard
        await expect(page).toHaveURL('/', { timeout: 10000 });
    });

    test('should create a new tag', async ({ page }) => {
        // Navigate to Reference Data
        await page.goto('/reference-data');
        
        // Click on Tags tab
        await page.click('text=Tags');
        
        // Click "Add New" button
        await page.click('button:has-text("Add New")');
        
        // Fill in tag name
        await page.fill('input[name="name"]', 'Test Tag');
        
        // Submit form
        await page.click('button[type="submit"]');
        
        // Verify tag appears in list
        await expect(page.locator('text=Test Tag')).toBeVisible();
    });

    test('should edit an existing tag', async ({ page }) => {
        // Navigate to Reference Data
        await page.goto('/reference-data');
        
        // Click on Tags tab
        await page.click('text=Tags');
        
        // Create a tag first
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'Original Tag');
        await page.click('button[type="submit"]');
        
        // Wait for tag to appear
        await expect(page.locator('text=Original Tag')).toBeVisible();
        
        // Click edit button (assuming there's an edit icon/button)
        const tagRow = page.locator('text=Original Tag').locator('..');
        await tagRow.locator('button:has-text("Edit")').click();
        
        // Update name
        await page.fill('input[name="name"]', 'Updated Tag');
        await page.click('button[type="submit"]');
        
        // Verify updated name
        await expect(page.locator('text=Updated Tag')).toBeVisible();
        await expect(page.locator('text=Original Tag')).not.toBeVisible();
    });

    test('should delete a tag', async ({ page }) => {
        // Navigate to Reference Data
        await page.goto('/reference-data');
        
        // Click on Tags tab
        await page.click('text=Tags');
        
        // Create a tag first
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'Tag To Delete');
        await page.click('button[type="submit"]');
        
        // Wait for tag to appear
        await expect(page.locator('text=Tag To Delete')).toBeVisible();
        
        // Click delete button
        const tagRow = page.locator('text=Tag To Delete').locator('..');
        await tagRow.locator('button:has-text("Delete")').click();
        
        // Confirm deletion (if there's a confirmation dialog)
        const confirmButton = page.locator('button:has-text("Confirm")').or(page.locator('button:has-text("Delete")'));
        if (await confirmButton.isVisible()) {
            await confirmButton.click();
        }
        
        // Verify tag is removed
        await expect(page.locator('text=Tag To Delete')).not.toBeVisible();
    });

    test('should prevent duplicate tag names', async ({ page }) => {
        // Navigate to Reference Data
        await page.goto('/reference-data');
        
        // Click on Tags tab
        await page.click('text=Tags');
        
        // Create first tag
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'Unique Tag');
        await page.click('button[type="submit"]');
        await expect(page.locator('text=Unique Tag')).toBeVisible();
        
        // Try to create duplicate
        await page.click('button:has-text("Add New")');
        await page.fill('input[name="name"]', 'Unique Tag');
        await page.click('button[type="submit"]');
        
        // Should show error message
        await expect(page.locator('text=already exists').or(page.locator('text=duplicate'))).toBeVisible({ timeout: 5000 });
    });
});


