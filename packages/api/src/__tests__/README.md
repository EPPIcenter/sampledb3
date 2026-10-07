# Backend testing guide

API tests run on Bun's runner because route and integration tests need `bun:sqlite`. Test files import `describe`, `it`, and `expect` from `'vitest'`; Bun maps that import to `bun:test`. `bun run test:ui` starts Vitest, which only runs tests that never touch `bun:sqlite`.

This guide covers the helpers. The rules are under API tests in `CODING_STANDARDS.md`.

## Test database

`setupTestDatabase()` in `helpers/db-setup.ts` opens an in-memory database through `openOperationalDatabase(':memory:')`, the production path, so it gets `initial_schema.sql` plus any pending migrations. To change the schema, follow `packages/api/src/db/README.md`.

```typescript
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'

describe('My API', () => {
  let testDb: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => cleanupTestDatabase(sqlite))
})
```

Integrity tests that seed orphan rows wrap the inserts in `withForeignKeysDisabled` from `src/db/apply-initial-schema.ts`.

## Factories

`helpers/factories.ts` exports a `createTest*` function per entity, taking the database and the fields to set:

```typescript
import { createTestStudy } from '../../__tests__/helpers/factories'

const study = await createTestStudy(testDb, { title: 'Test Study', shortCode: 'TS' })
```

## Authenticated route tests

`setupAuthenticatedRouteTest` creates the database, auth settings, users, and a logged-in session, then sends requests with that session's cookie:

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
      mount: (app, { db }) => {
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
    const res = await ctx.request('/api/search?q=test', { cookie: null })
    expect(res.status).toBe(401)
  })
})
```

`ctx.cookies[key]` holds each additional user's session cookie. To mount routes per test, as the `createCrudRoutes` tests do, omit `mount` and call `ctx.createRequestApp((app) => app.route('/api/tags', routes))`.

`__tests__/integration/` uses the same adapter for workflows that cross routes, such as derivation create then list. Pure logic stays in `lib/__tests__/`.

## Other helpers

`helpers/test-client.ts`:

- `getResponseData(response)` unpacks `{ data }` from a standard API response.
- `authenticatedRequest(app, path, options)` sends a request with a session cookie. `ctx.request` calls it for you.
- `createAuthenticatedClientWrapper(client, ctx.cookie)` adds the session cookie to a typed `hono/testing` client, for tests that build one on top of `setupAuthenticatedRouteTest`.
- `loginAndGetCookie` logs in and returns the session cookie. Call it directly only in tests of the login flow itself, such as `routes/__tests__/auth.test.ts` and `middleware/__tests__/auth.test.ts`.

`helpers/auth-helpers.ts` creates users and sessions and seeds the password, session, and pagination settings.
