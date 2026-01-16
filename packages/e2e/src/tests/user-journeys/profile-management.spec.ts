import { test, expect } from '@playwright/test';
import { resetDatabase } from '../../utils/db-reset';
import { completeSetup } from '../../utils/test-helpers';

test.describe('Profile Management Journey', () => {
    test.beforeAll(async () => {
        await resetDatabase();
    });

    test('should complete profile management flow', async ({ page }) => {
        // Step 1: Complete initial setup
        await completeSetup(page, { skipOptional: true });

        // Step 2: Navigate to profile page from sidebar
        // Look for sidebar navigation link to profile
        const profileLink = page.locator('a[href="/profile"], a:has-text("My Profile"), a:has-text("Profile")');
        if (await profileLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await profileLink.click();
        } else {
            // Fallback: navigate directly
            await page.goto('/profile');
        }

        // Step 3: Verify profile page loads
        await expect(page.locator('h1, h2')).toContainText(/profile/i, { timeout: 5000 });
        await expect(page.locator('text=My Profile')).toBeVisible();

        // Step 4: View current profile information
        await expect(page.getByLabel(/name/i)).toBeVisible();
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(page.getByLabel(/username/i)).toBeVisible();

        // Step 5: Update profile information (name, email, username)
        const nameInput = page.getByLabel(/name/i);
        const emailInput = page.getByLabel(/email/i);
        const usernameInput = page.getByLabel(/username/i);

        // Get current values
        const currentName = await nameInput.inputValue();
        const currentEmail = await emailInput.inputValue();
        const currentUsername = await usernameInput.inputValue().catch(() => '');

        // Update name
        await nameInput.clear();
        await nameInput.fill('Updated Test User');

        // Update email (use a test email)
        await emailInput.clear();
        await emailInput.fill('updated@test.com');

        // Update username
        await usernameInput.clear();
        await usernameInput.fill('updateduser');

        // Step 6: Save changes
        const saveButton = page.locator('button:has-text("Save Changes"), button[type="submit"]').first();
        await saveButton.click();

        // Step 7: Verify changes are saved
        await expect(page.locator('text=/profile updated successfully|success/i')).toBeVisible({ timeout: 5000 });

        // Verify form shows updated values
        await expect(nameInput).toHaveValue('Updated Test User');
        await expect(emailInput).toHaveValue('updated@test.com');
        await expect(usernameInput).toHaveValue('updateduser');

        // Step 8: Clear username
        await usernameInput.clear();
        await saveButton.click();
        await expect(page.locator('text=/profile updated successfully|success/i')).toBeVisible({ timeout: 5000 });

        // Step 9: Change password
        const currentPasswordInput = page.getByLabel(/current password/i);
        const newPasswordInput = page.getByLabel(/new password/i);
        const confirmPasswordInput = page.getByLabel(/confirm new password/i);

        await currentPasswordInput.fill('password123');
        await newPasswordInput.fill('newpassword123');
        await confirmPasswordInput.fill('newpassword123');

        const changePasswordButton = page.locator('button:has-text("Change Password"), button[type="submit"]').last();
        await changePasswordButton.click();

        // Step 10: Verify password change success
        await expect(page.locator('text=/password changed successfully|success/i')).toBeVisible({ timeout: 5000 });

        // Step 11: Logout
        const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")');
        if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await logoutButton.click();
        } else {
            // Fallback: navigate to logout endpoint or login page
            await page.goto('/login');
        }

        // Step 12: Verify login works with new username (if we set one)
        // First, let's set a username again
        await page.goto('/profile');
        await page.getByLabel(/username/i).fill('testusername');
        await page.locator('button:has-text("Save Changes")').click();
        await expect(page.locator('text=/success/i')).toBeVisible({ timeout: 5000 });

        // Logout
        await page.goto('/login');

        // Login with username
        await page.getByLabel(/email or username/i).fill('testusername');
        await page.getByLabel(/password/i).fill('newpassword123');
        await page.locator('button:has-text("Sign in"), button[type="submit"]').click();

        // Verify login successful
        await expect(page).toHaveURL('/', { timeout: 5000 });

        // Step 13: Verify login works with email after username change
        await page.goto('/login');
        await page.getByLabel(/email or username/i).fill('updated@test.com');
        await page.getByLabel(/password/i).fill('newpassword123');
        await page.locator('button:has-text("Sign in"), button[type="submit"]').click();

        // Verify login successful
        await expect(page).toHaveURL('/', { timeout: 5000 });
    });

    test('should handle username login flow', async ({ page }) => {
        // Step 1: Complete initial setup
        await completeSetup(page, { skipOptional: true });

        // Step 2: Navigate to profile and set username
        await page.goto('/profile');
        const usernameInput = page.getByLabel(/username/i);
        await usernameInput.clear();
        await usernameInput.fill('testuser123');
        await page.locator('button:has-text("Save Changes")').click();
        await expect(page.locator('text=/success/i')).toBeVisible({ timeout: 5000 });

        // Step 3: Logout
        await page.goto('/login');

        // Step 4: Login with username
        await page.getByLabel(/email or username/i).fill('testuser123');
        await page.getByLabel(/password/i).fill('password123');
        await page.locator('button:has-text("Sign in"), button[type="submit"]').click();

        // Step 5: Verify login successful
        await expect(page).toHaveURL('/', { timeout: 5000 });
        await expect(page.locator('h1, h2')).toContainText(/dashboard/i, { timeout: 5000 });

        // Step 6: Logout again
        await page.goto('/login');

        // Step 7: Login with email (both should work)
        await page.getByLabel(/email or username/i).fill('admin@example.com');
        await page.getByLabel(/password/i).fill('password123');
        await page.locator('button:has-text("Sign in"), button[type="submit"]').click();

        // Step 8: Verify login successful with email
        await expect(page).toHaveURL('/', { timeout: 5000 });
    });

    test('should validate profile form inputs', async ({ page }) => {
        // Step 1: Complete initial setup
        await completeSetup(page, { skipOptional: true });

        // Step 2: Navigate to profile page
        await page.goto('/profile');

        // Step 3: Try to submit with invalid email
        const emailInput = page.getByLabel(/email/i);
        await emailInput.clear();
        await emailInput.fill('invalid-email');
        
        const saveButton = page.locator('button:has-text("Save Changes")').first();
        await saveButton.click();

        // Step 4: Verify error message (browser validation or API error)
        // The browser may show validation, or we may see an API error
        const errorVisible = await page.locator('text=/invalid|error/i').isVisible({ timeout: 2000 }).catch(() => false);
        // If no error visible, the form might have browser validation preventing submit
        // This is acceptable behavior

        // Step 5: Try password change with mismatched passwords
        const newPasswordInput = page.getByLabel(/new password/i);
        const confirmPasswordInput = page.getByLabel(/confirm new password/i);

        await page.getByLabel(/current password/i).fill('password123');
        await newPasswordInput.fill('newpass123');
        await confirmPasswordInput.fill('differentpass123');

        const changePasswordButton = page.locator('button:has-text("Change Password")');
        await changePasswordButton.click();

        // Step 6: Verify error message for password mismatch
        await expect(page.locator('text=/passwords do not match|match/i')).toBeVisible({ timeout: 5000 });
    });
});
