import { Page, expect } from '@playwright/test';

/**
 * Helper to complete the initial setup flow
 */
export async function completeSetup(page: Page, options?: {
    adminName?: string;
    adminEmail?: string;
    adminPassword?: string;
    skipOptional?: boolean;
}) {
    const adminName = options?.adminName || 'Test Admin';
    const adminEmail = options?.adminEmail || 'admin@test.com';
    const adminPassword = options?.adminPassword || 'password123';

    await page.goto('/setup');
    
    // Step 1: Admin Account
    await page.getByLabel('Full Name').fill(adminName);
    await page.getByLabel('Email Address').fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);
    await page.getByLabel('Confirm Password').fill(adminPassword);
    await page.click('button:has-text("Next")');
    
    // Step 2: Core Definitions (accept defaults)
    await page.click('button:has-text("Next")');
    
    // Step 3: Infrastructure (accept defaults)
    await page.click('button:has-text("Next")');
    
    // Step 4: Biology (optional)
    if (options?.skipOptional) {
        await page.click('button:has-text("Finish Setup")');
    } else {
        await page.click('button:has-text("Finish Setup")');
    }
    
    // Wait for redirect
    await page.waitForURL('/', { timeout: 10000 });
}

/**
 * Helper to create a tag via the UI
 */
export async function createTag(page: Page, tagName: string) {
    await page.goto('/reference-data');
    await page.click('text=Tags');
    await page.click('button:has-text("Add New")');
    await page.fill('input[name="name"]', tagName);
    await page.click('button[type="submit"]');
    // Wait for tag to appear
    await expect(page.locator(`text=${tagName}`)).toBeVisible({ timeout: 5000 });
}

/**
 * Helper to create a specimen type via the UI
 */
export async function createSpecimenType(page: Page, typeName: string) {
    await page.goto('/reference-data');
    // Specimen Types should be the default tab
    await page.click('button:has-text("Add New")');
    await page.fill('input[name="name"]', typeName);
    await page.click('button[type="submit"]');
    await expect(page.locator(`text=${typeName}`)).toBeVisible({ timeout: 5000 });
}

/**
 * Helper to wait for API response
 */
export async function waitForApiResponse(page: Page, urlPattern: string | RegExp) {
    await page.waitForResponse((response) => {
        const url = response.url();
        if (typeof urlPattern === 'string') {
            return url.includes(urlPattern);
        }
        return urlPattern.test(url);
    });
}

/**
 * Helper to check if element exists without throwing
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
    try {
        await page.waitForSelector(selector, { timeout: 1000 });
        return true;
    } catch {
        return false;
    }
}

