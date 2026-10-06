# Coding standards

## Domain vocabulary

- Name a domain concept with the term `CONTEXT.md` defines for it, in code, test names, issue titles, and refactor proposals. Terms the glossary lists under _Avoid_ are synonyms to replace with the defined term.
- When a concept has no glossary entry, say so in the issue, PR, or proposal before introducing a term for it.

## ADRs

- A change that contradicts an ADR in `docs/adr/` names the ADR and gives the reason to reopen it, in the PR or proposal. For example: _Contradicts ADR-0006 (unified container inbound write), but worth reopening because…_

## Database

- A write of several statements that `await`s runs inside `withWriteTransaction` from `packages/api/src/db/write-transaction.ts`. Drizzle's bun-sqlite `db.transaction` commits at the callback's first `await`, so its callback stays synchronous.
- Every schema change is a numbered migration plus a refreshed `initial_schema.sql`, made with the recipe in `packages/api/src/db/README.md`. DDL lives only in migrations and the snapshot.
- Code and tests open a database through `openOperationalDatabase`. In tests that means `setupTestDatabase()`.

## Tests

- A test asserts the expected behaviour. When it fails, fix the code under test and keep the assertion as strict as before. A new test may land failing if it states the expected behaviour.

### API tests

- Each test gets its own database from `setupTestDatabase()` and closes it with `cleanupTestDatabase()` in `afterEach`.
- Seed rows with the factories in `packages/api/src/__tests__/helpers/factories.ts`.
- A route behind session auth is tested through `setupAuthenticatedRouteTest`.
- A CRUD route with `checkInUse` has a delete test for both the in-use and the free case.

### Web tests

- Components render through `await render(...)` from `packages/web/src/__tests__/helpers/render`.
- A test mocks the domain module the code imports (`lib/api/<domain>`) with `createMockedDomainModule`, and an override replaces a whole `*Api` object.
- Query elements by role or label (`getByRole`, `getByLabelText`), and drive interactions with `@testing-library/user-event`.
- A mutation hook's test asserts which queries it invalidates.
