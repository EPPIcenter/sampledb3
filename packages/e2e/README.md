# E2E Test Suite

This directory contains end-to-end tests for SampleDB using Playwright.

## Test Structure

### Test Files

- **`initialization.spec.ts`** - Tests the initial system setup flow
- **`setup-comprehensive.spec.ts`** - Comprehensive setup flow with validation tests
- **`tags.spec.ts`** - Tag management (CRUD operations, validation)
- **`containers-tags.spec.ts`** - Container tag assignment and filtering
- **`reference-data.spec.ts`** - Reference data management (specimen types, units, storage types, tags, strains)
- **`bootstrap.spec.ts`** - Empty state and bootstrap scenarios
- **`initial-setup.spec.ts`** - Basic initial setup verification

### Utilities

- **`db-reset.ts`** - Database reset utility for test isolation
- **`test-helpers.ts`** - Reusable helper functions for common test operations

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in UI mode (interactive)
pnpm test:ui

# Run specific test file
pnpm test src/tests/tags.spec.ts

# Run tests with codegen (record new tests)
pnpm codegen
```

## Test Database

Tests use a separate database file: `sampledb_e2e.sqlite` in the e2e package directory. This database is automatically reset before each test suite runs.

## Test Coverage

### Setup Flow
- ✅ Complete setup wizard (all 4 steps)
- ✅ Validation of required fields
- ✅ Navigation between steps
- ✅ Data persistence verification

### Tag Management
- ✅ Create tags
- ✅ Edit tags
- ✅ Delete tags
- ✅ Prevent duplicate tag names
- ✅ Prevent deletion of tags in use

### Reference Data
- ✅ Specimen types management
- ✅ Units management
- ✅ Storage types management
- ✅ Tags management
- ✅ Strains management
- ✅ Tab navigation

### Container Management
- ✅ Tag assignment to containers (placeholder)
- ✅ Filtering containers by tags (placeholder)

## Writing New Tests

### Using Test Helpers

```typescript
import { completeSetup, createTag } from '../utils/test-helpers';

test('my test', async ({ page }) => {
    // Complete setup automatically
    await completeSetup(page);
    
    // Create a tag
    await createTag(page, 'My Tag');
    
    // Your test logic here
});
```

### Best Practices

1. **Use `beforeAll` for database reset** - Ensures clean state
2. **Use `beforeEach` for setup** - Complete system initialization if needed
3. **Use test helpers** - Reuse common operations
4. **Wait for elements** - Use `waitForSelector` or `expect().toBeVisible()`
5. **Use meaningful selectors** - Prefer text content over CSS selectors when possible
6. **Clean up** - Tests should be independent and not rely on previous test state

## Configuration

See `playwright.config.ts` for:
- Test directory
- Web server configuration (API and Web)
- Browser configuration
- Reporter settings

## CI/CD

Tests are configured to:
- Run with retries in CI (2 retries)
- Use single worker to avoid database conflicts
- Generate HTML reports
- Run in Chromium by default


