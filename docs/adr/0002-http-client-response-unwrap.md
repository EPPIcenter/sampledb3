# HTTP client returns response bodies

---
status: accepted
---

The web client’s shared HTTP layer (`packages/web/src/lib/api/client.ts`) exposes an `api` object whose `get`, `post`, `put`, `patch`, and `delete` methods resolve to the **JSON response body** (`Promise<T>`), not `AxiosResponse<T>`. The raw axios instance remains available as `axiosApi` when callers need status codes, headers, or interceptors.

## Rationale

Previously every domain module and many pages duplicated `const response = await api.get(...); return response.data`, while tests mocked full axios responses (`{ data: { ... }, status, headers, config }`). That split made hooks and components easy to get wrong after refactors and kept test fixtures verbose.

Unwrapping at the client boundary gives one convention: **domain APIs and hooks work with bodies; only axios error objects retain `response.data` for server error messages.**

## Rules

### Domain modules (`lib/api/*`)

- Call `api.get/post/...` and return the result directly (or map fields from it).
- Do not add another `.data` unwrap unless the backend body itself uses an envelope (see below).
- For `GET /settings/:key`, use `settingsApi.getValue(key)` or `settingsApi.get(key).value` — never `api.get<SettingValue>(`/settings/${key}`)`.
- For `PUT /settings/:key`, use `settingsApi.putValue(key, value, userId?)` or `settingsApi.update(...)` (alias) — never type the response as the setting value directly. Bulk writes via `exportConfigurationsApi.update` / `scannerConfigurationsApi.update` / `tableViewConfigurationsApi.update` delegate to `putValue`.

### Pages, components, and hooks

- Prefer domain APIs (`studiesApi.get`, `subjectsApi.getSummary`) over raw `api.get` when a module exists.
- After `await someApi.method()`, use the returned shape as the body: `res.study`, `res.configurations`, not `res.data.study`.

### Two backend body shapes

| Shape | Example endpoints | Client usage |
|-------|-------------------|--------------|
| **Direct** | `{ study }`, `{ locations: [] }`, `{ user }` | Use top-level keys on the unwrapped body. |
| **`ApiResponse` envelope** | `GET /units`, `GET /specimen-types`, etc. → `{ data: T[], meta? }` | Reference-data CRUD: `*Api.list()` → `{ data, meta }`. Dropdowns and form bootstrap: `unitsApi.listAll()` → `Unit[]` (unwraps `list()`). Do not use removed `GET /settings/units`. |
| **Settings key envelope** | `GET /settings/:key` → `{ key, value }`; `PUT /settings/:key` → `{ key, value, userId? }` | Read: `settingsApi.getValue(key, { scope? })`. Write: `settingsApi.putValue` / `settingsApi.update`. Do not type either direction as the setting value directly. For export/scanner: omit `scope` (or `effective`) for merged runtime config; `shared` / `personal` for admin editors. Legacy `/settings/export-configurations/shared` routes remain on the server but the web client uses `getValue` only. |
| **Named `data` field** | Export POST → `{ summary, data: string \| rows, filename }` | `response.data` is the export payload field, not axios — do not “unwrap” it again. |
| **Container detail** | `GET /containers/:id` → `{ container, specimen, source }` | Use `containersApi.get(id)` — returns normalized `ContainerDetail`; do not read flattened duplicate keys from legacy responses. List: `containersApi.list()`. |

### Errors

- Axios errors are unchanged: `err.response?.data?.error` for message text.
- Do not change error-handling types when migrating success paths.

### Blobs and binary

- `responseType: 'blob'` still works; the unwrapped value is the `Blob` (axios’s `response.data`).

## Tests

- Mock domain APIs with **body shapes**: `mockResolvedValue({ user })`, `mockResolvedValue({ locations: [] })`.
- Mock `api` in `createMockedDomainModule('client', { default: { get: vi.fn().mockResolvedValue({ studies: [] }) } })` with unwrapped bodies.
- Keep `{ data: [] }` only when testing code that consumes `ApiResponse` list helpers (`specimenTypesApi.list()` return type).
- **Settings:** use `packages/web/src/__tests__/helpers/settings-mocks.ts` — `settingsGetEnvelope` / `settingsPutEnvelope` for low-level `api` mocks; `mockSettingsApiGetValue` or `scannerConfigurationsValue` / `exportConfigurationsValue` for `settingsApi.getValue` (unwrapped). Do not pass `{ configurations: [] }` to `api.get` on `/settings/:key`; that shape will not catch envelope bugs.
- Do not mock `status`, `statusText`, `headers`, or `config` on domain API mocks unless testing `axiosApi` directly.
- **Runtime validation:** `lib/api/__tests__/parse-response.test.ts` covers envelope schemas; settings/containers tests assert `ApiContractError` on invalid bodies.

## Runtime validation (P7)

Zod parse at **domain module boundaries**. Shared request schemas live in `@sampledb/contract`; web-local response parsing remains in `parse-response.ts`.

### Shared contract (`@sampledb/contract`)

- **Bulk combined import requests** — `bulkCombinedRequestSchema` and `bulkCombinedValidateRequestSchema` for `POST /imports/bulk-combined` and `POST /imports/bulk-combined/validate`. The API parses inbound JSON with these schemas; the web imports API and bulk import payload builder use the inferred TypeScript types (`BulkCombinedRequest`, `BulkCombinedValidateRequest`). Types-only on the web — no runtime Zod parse in the browser for bulk import requests; server validation remains the source of truth for business rules.
- **Bulk combined import responses** — `bulkCombinedValidateResponseSchema`, `bulkCombinedImportResponseSchema`, and related error/summary schemas. Web `importsApi` uses inferred response types (`BulkCombinedValidateResponse`, `BulkCombinedImportResponse`). Types-only on the web for responses; API routes return shapes matching these schemas.
- **Shared container input** — `containerInputSchema` primitive for single-specimen and bulk combined container fields.
- **Collection delete preflight** — `collectionDeletePreflightSchema` for delete-with-contents preflight summary.
- Cross-package conformance tests assert web-built validate payloads and representative response fixtures satisfy contract schemas.

### Web-local parse-response

These response wire shapes remain in `packages/web/src/lib/api/parse-response.ts` until a second consumer justifies moving them into contract:

- `parseSettingsEnvelope` — settings key envelope (`GET`/`PUT /settings/:key`)
- `parseApiResponseData` — reference-data CRUD list envelope (`{ data, meta? }`)
- `parseContainerDetailWire`, `parseContainersList` — container detail and list wire formats

Failures throw `ApiContractError`. Wired in `settingsApi.getValue` / `putValue`, `extractData()` (reference-data lists), `containersApi.get` / `list`.

### Out of scope (for now)

- Runtime Zod parse of outgoing bulk import bodies in the browser
- Migrating parse-response schemas into contract (settings envelope, container detail wire — incremental follow-up when duplication warrants it)

## Consequences

- Older tests that still use axios-shaped mocks must be updated (see migration in the same PR as client unwrap).
- New code should not import a removed `lib/api` barrel; import from `lib/api/<domain>`.
