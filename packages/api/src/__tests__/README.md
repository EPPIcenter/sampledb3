# Backend Testing Guide

## Setup

Tests use **Bun's test runner** (not Vitest) so that route and integration tests can use `bun:sqlite` in db-setup. Coverage uses **Bun's built-in coverage** (`bun test --coverage`) so all 431 tests are included in the report. Run tests with:

```bash
bun test src          # Run once (431 tests)
bun test --watch src  # Watch mode
bun test:ui           # Vitest UI (for lib-only tests; route tests require Bun)
bun test:coverage     # Run tests with coverage (Bun; report in coverage/)
```

Coverage is configured in `packages/api/bunfig.toml` (reporters: text, lcov). Baseline has been raised with lib and route tests; the target is 90% lines. Optional `coverageThreshold` in bunfig.toml can be enabled and raised in steps (e.g. 60 → 75 → 90) as coverage improves.

## Test Structure

- `__tests__/helpers/` - Test utilities
  - `db-setup.ts`: In-memory database setup and cleanup
  - `factories.ts`: Test data factories for creating test entities
  - `test-client.ts`: Hono test client utilities and assertion helpers
- `__tests__/fixtures/` - Test data fixtures
- `routes/__tests__/` - Route handler tests
- `lib/__tests__/` - Library/utility function tests (e.g. plate-csv, plate-scan-validation, defaults, container-move, derivations, control-batch-creation, error-utils, logger, cache, openapi)
- `middleware/__tests__/` - Middleware tests (e.g. auth, rate-limit)

## Test Database

Tests use an in-memory SQLite database created in `db-setup.ts`. The `setupTestDatabase()` function:
- Creates a fresh in-memory database for each test suite
- Sets up the schema using SQL DDL statements
- Returns both the Drizzle database instance and SQLite instance for cleanup

Example usage:

```typescript
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'

describe('My API', () => {
  let testDb: Database
  let sqlite: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })
})
```

## Test Data Factories

Use factories from `factories.ts` to create test data:

```typescript
import { createTestState, createTestStorageContainer } from '../../__tests__/helpers/factories'

const testState = await createTestState(testDb, { name: 'Test State' })
```

Available factories:
- `createTestTag`
- `createTestStorageType`
- `createTestSpecimenType`
- `createTestStrain`
- `createTestStorageContainer`
- `createTestLocation`
- `createTestControlDefinition`
- `createTestSpecimen`
- `createTestUnit`
- `createTestStudy`
- `createTestStudySubject`

## Writing Tests

### Testing Routes with CRUD Factory

For routes using `createCrudRoutes`, create the routes dynamically in tests with the test database:

```typescript
import { createCrudRoutes } from '../../lib/crud-routes'
import { z } from 'zod'

describe('States API', () => {
  let statesRoutes: Hono

  beforeEach(async () => {
    const { db } = await setupTestDatabase()
    
    const createSchema = z.object({
      name: z.string().min(1),
    })

    statesRoutes = createCrudRoutes({
      table: state,
      database: db,
      entityName: 'State',
      pluralName: 'states',
      singularName: 'state',
      createSchema,
    })
  })
})
```

### Testing Route Handlers

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { testClient } from 'hono/testing'
import { Hono } from 'hono'
import myRoutes from '../my-routes'

describe('My API', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.route('/api/my-route', myRoutes)
  })

  it('should do something', async () => {
    const client = testClient(app)
    const res = await client.api['my-route'].$get()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('items')
  })
})
```

## Coverage

Coverage thresholds are set to 60% for:
- Statements
- Branches
- Functions
- Lines

Run coverage reports:

```bash
bun test:coverage
```

Coverage reports are generated in:
- `coverage/` directory (HTML, JSON, text formats)

## Test Utilities

### `test-client.ts` Helpers

- `createTestClient(app)`: Creates a Hono test client
- `expectStatus(response, expectedStatus)`: Asserts response status
- `expectError(response, expectedMessage?)`: Asserts error response
- `expectJsonStructure(response, structure)`: Asserts JSON structure

## Running Tests From Repo Root

From the repository root you can run all package tests and coverage:

```bash
bun run test          # Run API and web tests
bun run test:coverage # Run API and web tests with coverage
```

## New Tests and Failing Behavior

New tests are allowed to **fail** initially if they correctly express expected behavior. Follow-up work will update the implementation to satisfy the tests. Do not remove or relax assertions solely to make tests pass; fix the code under test instead.

## Best Practices

1. **Always use test database**: Use `setupTestDatabase()` to get a fresh database for each test
2. **Clean up**: Always call `cleanupTestDatabase()` in `afterEach`
3. **Use factories**: Use test data factories instead of manual inserts
4. **Test edge cases**: Include tests for validation errors, 404s, duplicates, etc.
5. **Test "in use" scenarios**: For routes with `checkInUse`, test both in-use and not-in-use cases

