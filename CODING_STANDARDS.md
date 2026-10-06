# Coding standards

## Domain language

- Name a domain concept with the term `CONTEXT.md` defines for it, in code, test names, issue titles, and proposals. A term the glossary lists under _Avoid_ is a synonym to replace with the defined term.
- When a concept has no glossary entry, say so in the issue, PR, or proposal before introducing a term for it.
- A change that contradicts an ADR in `docs/adr/` names the ADR and gives the reason to reopen it, in the PR or proposal. For example: _Contradicts ADR-0006 (unified container inbound write), but worth reopening because…_

## Tests

- A test asserts the expected behaviour. When it fails, fix the code under test and keep the assertion as strict as before. A new test may land failing if it states the expected behaviour.

## API

Paths are relative to `packages/api/`.

### Database

- A write of several statements that `await`s runs inside `withWriteTransaction` from `src/db/write-transaction.ts`.
- Change the schema with a numbered migration, following the recipe in `src/db/README.md`. DDL lives only in the migrations and `initial_schema.sql`.
- Code opens a database through `openOperationalDatabase`.

### API tests

- Each test gets its own database from `setupTestDatabase()` and closes it with `cleanupTestDatabase()` in `afterEach`.
- Seed rows with the factories in `src/__tests__/helpers/factories.ts`.
- A route behind session auth is tested through `setupAuthenticatedRouteTest`.
- A CRUD route with `checkInUse` has a delete test for both the in-use and the free case.

## Web

Paths are relative to `packages/web/`.

- Call the API through its domain module, `src/lib/api/<domain>`. Its methods resolve to the response body, so read `res.study`. Reference-data `list()` helpers are the exception: their body is `{ data, meta? }` (ADR 0002).

### Web tests

- Components render through `await render(...)` from `src/__tests__/helpers/render`.
- A test mocks the domain module the code imports with `createMockedDomainModule`. An override replaces a whole `*Api` object and resolves to the same body the real module returns.
- Query elements by role or label (`getByRole`, `getByLabelText`), and drive interactions with `@testing-library/user-event`.
- A mutation hook's test asserts which queries it invalidates.
