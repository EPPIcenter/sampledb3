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

### Domain modules

- Create a Specimen or Container through `registerSpecimens` in `src/lib/specimen-registration/`. Validate a request with `checkSpecimenRegistration`, which is the same write rolled back (ADR 0010).
- A request that carries a container validates it with `containerWriteInputSchema` from `@sampledb/contract` (ADR 0006).
- Resolve a Specimen's Source with `resolveSpecimenSource` or `resolveSpecimenSources` from `src/lib/specimens/provenance.ts`, and hand every caller the full `SpecimenSource` shape (ADR 0007).
- Build a container payload (placement, Tags, Specimen, Source) from `loadContainerReadViews` in `src/lib/container-read-view.ts`, then project it (ADR 0009).

### Routes

- A route maps Drizzle rows to a wire DTO before `c.json` wherever the shape matters. `omitOnWireMiddleware` drops null keys from every response, so null omission stays with it (ADR 0005).
- A route reports an error by throwing a typed error from `src/lib/error-handler.ts` or returning `handleRouteError(error, c)` (ADR 0004).
- Structured stdout goes through `src/lib/observability.ts`. A failure meant for Admin Error Logs goes through `src/lib/error-logger.ts` (ADR 0004).

### API tests

- Each test gets its own database from `setupTestDatabase()` and closes it with `cleanupTestDatabase()` in `afterEach`.
- Seed rows with the factories in `src/__tests__/helpers/factories.ts`.
- A route behind session auth is tested through `setupAuthenticatedRouteTest`.
- A CRUD route with `checkInUse` has a delete test for both the in-use and the free case.

## Web

Paths are relative to `packages/web/`.

- Call the API through its domain module, `src/lib/api/<domain>`. Its methods resolve to the response body, so read `res.study`. Reference-data `list()` helpers are the exception: their body is `{ data, meta? }` (ADR 0002).
- Read and write settings with `settingsApi.getValue` and `settingsApi.putValue` (ADR 0002).
- A Zod schema for a response marks an unset field `.optional()`, because the wire omits it (ADR 0005).
- Show a query's read error inline with `PageError` or `SectionMessage` from `src/ui/`. Toasts are for mutation errors (ADR 0001).
- A mutation goes through a domain hook that invalidates every query it affects, `dashboardKeys` included (ADR 0001).
- Scan move behaviour lands in the `src/lib/scan-move/` core with plain-data unit tests. The move pages only wire it up (ADR 0008).

### Web tests

- Components render through `await render(...)` from `src/__tests__/helpers/render`.
- A test mocks the domain module the code imports with `createMockedDomainModule`. An override replaces a whole `*Api` object and resolves to the same body the real module returns.
- Query elements by role or label (`getByRole`, `getByLabelText`), and drive interactions with `@testing-library/user-event`.
- A mutation hook's test asserts which queries it invalidates.
