# Coding standards

## Domain language

- Name a domain concept with the term `CONTEXT.md` defines for it, in code, test names, issue titles, and proposals. Treat a term the glossary lists under _Avoid_ as a synonym, and replace it with the defined term.
- When a concept has no glossary entry, say so in the issue, PR, or proposal before you introduce a term for it.
- When a change contradicts an ADR in `docs/adr/`, name the ADR and give the reason to reopen it, in the PR or proposal. For example: _Contradicts ADR 0006 (unified container inbound write), but worth reopening because…_

## Tests

- Assert the expected behaviour. When a test fails, fix the code under test and keep the assertion as strict as before. You may land a new test that fails, if it states the expected behaviour.

## API

Paths are relative to `packages/api/`.

### Database

- Run a write of several statements that `await`s inside `withWriteTransaction` from `src/db/write-transaction.ts`. Drizzle's bun-sqlite `db.transaction(async () => …)` commits at the callback's first `await` instead of awaiting the returned Promise, so the rest of the write runs outside the transaction. ESLint rejects any callback passed to `.transaction(...)` that returns a Promise.
- Change the schema with a numbered migration, following the recipe in `src/db/README.md`, and refresh `initial_schema.sql` to match. Keep DDL out of the connection code (`src/db/open.ts`, `src/db/client.ts`), routes, and `src/lib/`. The schema-evolution modules in `src/db/` (`migration-runner.ts`, `migration-preflight.ts`, `legacy-baseline.ts`, `apply-initial-schema.ts`) run DDL as part of evolution, and tests may create tables inline to build a legacy or partial database, as `src/db/__tests__/client.test.ts` and `src/lib/subjects/__tests__/subject-read.test.ts` do.
- Open a database through `openOperationalDatabase`, which runs schema evolution. Open the file directly only when the code must not migrate it, and say why in a comment. For example, `src/scripts/check-integrity.ts` opens a backup with `new Database(path, { readonly: true })` so that checking it leaves it unchanged, and `src/db/__tests__/initial-schema-snapshot.test.ts` applies `initial_schema.sql` alone so that pending migrations can't hide a stale snapshot.

### API tests

- Give each test its own database from `setupTestDatabase()`, and close it with `cleanupTestDatabase()` in `afterEach`.
- Seed rows with the factories in `src/__tests__/helpers/factories.ts`.
- Test a route behind session auth through `setupAuthenticatedRouteTest`. Log in by hand with `loginAndGetCookie` only when the login flow is under test, as in the auth route and middleware tests.
- For a CRUD route with `checkInUse`, write a delete test for both the in-use and the free case.
- Test a route's error cases as well as its success: validation errors, 404s, and duplicates.

## Web

Paths are relative to `packages/web/`.

- Call the API through its domain module, `src/lib/api/<domain>`. Its methods resolve to the response body, so read `res.study`. Reference-data `list()` helpers are the exception: their body is `{ data, meta? }` (ADR 0002).

### Web tests

- Mock the domain module the code imports with `createMockedDomainModule`. Make each override replace a whole `*Api` object and resolve to the same body the real module returns.
- In a new or changed test, render with `await render(...)` from `src/__tests__/helpers/render`, query elements by role or label (`getByRole`, `getByLabelText`), and drive interactions with `@testing-library/user-event`. Older tests still render with `@testing-library/react`'s `render`, click with `fireEvent`, and query by text; convert a test when you change it. Tests of a provider itself, such as `src/contexts/__tests__/ThemeContext.test.tsx`, render without the helper because it would wrap them in a second copy of the provider.
- Wait for async results with `findBy*` queries or `waitFor`.
- Test a component's loading and error states, not only its loaded state.
- In a mutation hook's test, assert which queries it invalidates.
