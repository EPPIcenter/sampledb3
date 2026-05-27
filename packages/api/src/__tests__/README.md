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
  - `authenticated-route-test.ts`: Authenticated route test adapter (DB, login, `createRequestApp`, `request`)
  - `test-client.ts`: Hono test client utilities and assertion helpers
- `__tests__/fixtures/` - Test data fixtures
- `routes/__tests__/` - Route handler tests
- `lib/__tests__/` - Library/utility function tests (e.g. plate-csv, plate-scan-validation, defaults, container-move, derivations, error-utils, logger, cache, openapi)
- `lib/controls/__tests__/` - Control domain libs (batch-with-specimens, batch-csv-validate, definition-summary, batch-delete, strain-composition, control-read)
- `middleware/__tests__/` - Middleware tests (e.g. auth, rate-limit)

## Test Database

Tests use an in-memory SQLite database created in `db-setup.ts`. The `setupTestDatabase()` function:
- Creates a fresh in-memory database for each test suite
- Applies `packages/api/initial_schema.sql` (same Drizzle-generated snapshot production uses via `applyInitialSchema`)
- Returns both the Drizzle database instance and SQLite instance for cleanup

Regenerate the snapshot after schema changes: `bunx drizzle-kit generate` in `packages/api`, then copy the generated SQL to `initial_schema.sql` (see `drizzle.config.ts`).

Integrity tests that seed orphan rows use `withForeignKeysDisabled` from `src/db/apply-initial-schema.ts` so fixtures match production constraints while allowing deliberate corruption.

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

## Authenticated route tests

For route handlers behind session auth, use `setupAuthenticatedRouteTest` instead of duplicating DB setup, settings, user creation, and login:

```typescript
import { setupAuthenticatedRouteTest, type AuthenticatedRouteTestContext } from '../../__tests__/helpers/authenticated-route-test'
import { createSearchRoutes } from '../search'

describe('Search API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: { email: 'user@test.com', role: 'member' },
      settings: { pagination: true }, // when list routes use validateLimit
      additionalUsers: [{ key: 'member', email: 'member@test.com', role: 'member' }],
      seed: async ({ db }) => { /* optional fixtures before login */ },
      mount: (app, { db, sqlite }) => {
        app.route('/api/search', createSearchRoutes(db))
      },
    })
  })

  afterEach(() => ctx.cleanup())

  it('returns results', async () => {
    const res = await ctx.request('/api/search?q=test')
    expect(res.status).toBe(200)
  })

  it('returns 401 without auth', async () => {
    const res = await authenticatedRequest(ctx.createRequestApp(), '/api/search?q=test', { method: 'GET' })
    expect(res.status).toBe(401)
  })
})
```

Per-test routes (e.g. CRUD factory): omit `mount` and use `ctx.createRequestApp((app) => app.route('/api/tags', routes))`.

### Integration workflows

`__tests__/integration/` uses the same adapter for cross-route HTTP workflows (e.g. derivation create + list, collection move). Lib tests in `lib/__tests__/` still own pure logic; integration tests assert the full HTTP seam.

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
- `getResponseData(response)`: Unpacks `{ data }` from standardized API responses
- `authenticatedRequest(app, path, options)`: HTTP request with session cookie
- `loginAndGetCookie` / `createAuthenticatedClientWrapper`: Session helpers for route tests

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

