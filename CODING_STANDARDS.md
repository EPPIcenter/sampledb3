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

- Run a write of several statements that `await`s inside `withWriteTransaction` from `src/db/write-transaction.ts`. Drizzle's bun-sqlite `db.transaction(async () => …)` commits at the callback's first `await` instead of awaiting the returned Promise, so the rest of the write runs outside the transaction. ESLint rejects an `async` callback passed to `.transaction(...)`.
- Change the schema with a numbered migration, following the recipe in `src/db/README.md`. Keep DDL in the migrations and `initial_schema.sql` only.
- Open a database through `openOperationalDatabase`, which runs schema evolution. Open the file directly only when the code must not migrate it, and say why in a comment. For example, `src/scripts/check-integrity.ts` opens a backup with `new Database(path, { readonly: true })` so that checking it leaves it unchanged.

### Domain modules

- In a new write path, create Specimens and Containers with `registerSpecimens` from `src/lib/specimen-registration/` (ADR 0010). Bulk combined import and `/subjects/with-specimens` have migrated. These paths still insert Specimens directly until their slice in ADR 0010 lands: `POST /specimens`, add-container and `/specimens/bulk`, which validate with `validateSpecimenData` or `validateBulkSpecimenRows` (`src/routes/specimens.ts`, `src/lib/registration-orchestrator.ts`); derivations (`src/lib/derivations.ts`); and control batches (`src/lib/controls/batch-with-specimens.ts`).
- In a new write path, validate a registration with `checkSpecimenRegistration`, or wrap the whole write in `withRolledBackTransaction` when the caller writes its own records first (ADR 0010).
- Validate an inbound container with a `@sampledb/contract` schema (`containerWriteInputSchema`, `bulkCombinedContainerSchema` or `optionalContainerInputSchema`), not an endpoint-specific container Zod schema (ADR 0006).
- Map a CSV row to `ContainerWriteInput` with `csvRowToContainerWriteInput` from `@sampledb/contract` (ADR 0006). The web bulk import and control-batch CSVs still map through `flatBulkContainerToWriteInput` and `flatControlBatchContainerToWriteInput` in `packages/web/src/lib/`.
- In a `ContainerWriteInput`, place a paper container on a `collection` of type `sheet`, not on a box or bag `collection` with a sibling `sheetName` (ADR 0006).
- Resolve a Specimen's Source with `resolveSpecimenSource` or `resolveSpecimenSources` from `src/lib/specimens/provenance.ts` (ADR 0007).
- Return the full `SpecimenSource` shape to every caller, not a per-endpoint subset (ADR 0007).
- Load a container read payload (placement, Tags, Specimen, Source) with `loadContainerReadViews` or `loadContainerReadViewsByIds` from `src/lib/container-read-view.ts` (ADR 0009).
- Project the loaded view to its read path's type: `EnrichedContainerApi` for list, derivations and PATCH, `EnrichedStorageContainer` for collection detail, and CSV row fields for Container export (ADR 0009).

### Routes

- In new or changed route code, report an error by throwing a typed error from `src/lib/error-handler.ts` or returning `handleRouteError(error, c)`, not with `return c.json({ error }, 4xx)` (ADR 0004).
- Throw `ExpectedNotFoundError` for a 404 caused by user input, such as an export preflight miss or a user-supplied lookup, and `NotFoundError` for a missing resource on a direct GET or a stale link (ADR 0004).
- Write no route-level `catch` block that calls `console.error`; return `handleRouteError(error, c)` from it instead (ADR 0004).
- In new code, write log lines to stdout with `logDebug`, `logInfo`, `logWarn` or `logError` from `src/lib/observability.ts`, not `console.*`. Startup banners and schema-evolution CLI output stay plain `console.log` (ADR 0004). The `console.warn` in `logTemplateError` in `src/routes/qpcr-experiments.ts` predates this rule.
- Persist a failure to the `error_logs` table with `src/lib/error-logger.ts`, not `observability.ts`. Both export `logError`, so check the import path (ADR 0004).
- In a new or changed route handler, do not spread a Drizzle row into a `c.json` payload (ADR 0005). `...newSpecimen` in `src/routes/specimens.ts` and `...locationRecord` in `src/routes/locations.ts` predate this rule.
- Map a response that has a schema in `@sampledb/contract/wire` (containers today) to that wire DTO before `c.json` (ADR 0005).
- Leave null omission to `omitOnWireMiddleware`: do not call `toWireJson()` in a route handler (ADR 0005).

### API tests

- Give each test its own database from `setupTestDatabase()`, and close it with `cleanupTestDatabase()` in `afterEach`.
- Seed rows with the factories in `src/__tests__/helpers/factories.ts`.
- Test a route behind session auth through `setupAuthenticatedRouteTest`. Log in by hand with `loginAndGetCookie` only when the login flow is under test, as in the auth route and middleware tests.
- For a CRUD route with `checkInUse`, write a delete test for both the in-use and the free case.
- Test a route's error cases as well as its success: validation errors, 404s, and duplicates.

## Web

Paths are relative to `packages/web/`.

- Call the API through its domain module, `src/lib/api/<domain>`. Its methods resolve to the response body, so read `res.study`. Reference-data `list()` helpers are the exception: their body is `{ data, meta? }` (ADR 0002).
- Read a setting with `settingsApi.getValue(key)` or `settingsApi.get(key).value`, never `api.get` on `/settings/:key` (ADR 0002).
- Write a setting with `settingsApi.putValue`, `settingsApi.update`, or the bulk wrappers `exportConfigurationsApi.update`, `scannerConfigurationsApi.update` and `tableViewConfigurationsApi.update`, never `api.put` on `/settings/:key` (ADR 0002).
- In a Zod parser for a container response, mark an unset field `.optional()`, not `.nullish()` (ADR 0005). Other response parsers are out of scope, such as `parseSettingsEnvelope` in `src/lib/api/parse-response.ts`.
- On a screen ADR 0001 lists as migrated, show a query's read error inline with `PageError` or `SectionMessage` from `src/ui/`, not a toast (ADR 0001). Workflow local state (CSV parse, server validate, submits) keeps its inline or toast errors.
- Prefer to send a new mutation through a domain hook, such as `useCreateStudy`, that invalidates the queries the mutation changes, including `dashboardKeys` when it changes dashboard data (ADR 0001). Direct `*Api.create`, `update` and `delete` calls in `Locations.tsx`, `QpcrExperimentDetail.tsx`, `StudyDetail.tsx`, `SubjectForm.tsx` and `ControlDefinitionForm.tsx` predate this rule.
- Put new Scan move behaviour in the `src/lib/scan-move/` core with plain-data unit tests, not in `ContainerMoveMicronix.tsx` or `ContainerMoveCryovial.tsx` (ADR 0008). The paper move page, `ContainerMovePapers.tsx`, is not a Scan move.
- Pass a Scan move effect a `ScanMoveGateway` instead of importing `collectionsApi` into it (ADR 0008).
- Test Scan move effects with plain stub gateway functions, not `vi.mock` (ADR 0008).
- Open a modal with `Modal` from `src/ui/`, not `ModalPortal` (ADR 0001). `CommandPalette` and `SearchModal` still use `ModalPortal` directly.

### Web tests

- Render components with `await render(...)` from `src/__tests__/helpers/render`.
- Mock the domain module the code imports with `createMockedDomainModule`. Make each override replace a whole `*Api` object and resolve to the same body the real module returns.
- Query elements by role or label (`getByRole`, `getByLabelText`), and drive interactions with `@testing-library/user-event`.
- Wait for async results with `findBy*` queries or `waitFor`.
- Test a component's loading and error states, not only its loaded state.
- In a mutation hook's test, assert which queries it invalidates.
