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

- Run a write of several statements that `await`s inside `withWriteTransaction` from `src/db/write-transaction.ts`.
- Change the schema with a numbered migration, following the recipe in `src/db/README.md`. Keep DDL in the migrations and `initial_schema.sql` only.
- Open a database through `openOperationalDatabase`.

### API tests

- Give each test its own database from `setupTestDatabase()`, and close it with `cleanupTestDatabase()` in `afterEach`.
- Seed rows with the factories in `src/__tests__/helpers/factories.ts`.
- Test a route behind session auth through `setupAuthenticatedRouteTest`.
- For a CRUD route with `checkInUse`, write a delete test for both the in-use and the free case.

## Web

Paths are relative to `packages/web/`.

- Call the API through its domain module, `src/lib/api/<domain>`. Its methods resolve to the response body, so read `res.study`. Reference-data `list()` helpers are the exception: their body is `{ data, meta? }` (ADR 0002).

### Web tests

- Render components with `await render(...)` from `src/__tests__/helpers/render`.
- Mock the domain module the code imports with `createMockedDomainModule`. Make each override replace a whole `*Api` object and resolve to the same body the real module returns.
- Query elements by role or label (`getByRole`, `getByLabelText`), and drive interactions with `@testing-library/user-event`.
- In a mutation hook's test, assert which queries it invalidates.
