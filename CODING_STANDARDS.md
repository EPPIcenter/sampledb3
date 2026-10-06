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

- Each test gets its own database from `setupTestDatabase()` and closes it with `cleanupTestDatabase()` in `afterEach`.
- Seed rows with the factories in `src/__tests__/helpers/factories.ts`.
- A route behind session auth is tested through `setupAuthenticatedRouteTest`.
- A CRUD route with `checkInUse` has a delete test for both the in-use and the free case.

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

- Components render through `await render(...)` from `src/__tests__/helpers/render`.
- A test mocks the domain module the code imports with `createMockedDomainModule`. An override replaces a whole `*Api` object and resolves to the same body the real module returns.
- Query elements by role or label (`getByRole`, `getByLabelText`), and drive interactions with `@testing-library/user-event`.
- A mutation hook's test asserts which queries it invalidates.
