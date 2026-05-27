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

### Pages, components, and hooks

- Prefer domain APIs (`studiesApi.get`, `subjectsApi.getSummary`) over raw `api.get` when a module exists.
- After `await someApi.method()`, use the returned shape as the body: `res.study`, `res.configurations`, not `res.data.study`.

### Two backend body shapes

| Shape | Example endpoints | Client usage |
|-------|-------------------|--------------|
| **Direct** | `{ study }`, `{ locations: [] }`, `{ user }` | Use top-level keys on the unwrapped body. |
| **`ApiResponse` envelope** | `GET /specimen-types` → `{ data: T[], meta? }` | `extractData(body)` in reference-data list helpers; callers of `specimenTypesApi.list()` still receive `{ data, meta }`. |
| **Named `data` field** | Export POST → `{ summary, data: string \| rows, filename }` | `response.data` is the export payload field, not axios — do not “unwrap” it again. |

### Errors

- Axios errors are unchanged: `err.response?.data?.error` for message text.
- Do not change error-handling types when migrating success paths.

### Blobs and binary

- `responseType: 'blob'` still works; the unwrapped value is the `Blob` (axios’s `response.data`).

## Tests

- Mock domain APIs with **body shapes**: `mockResolvedValue({ user })`, `mockResolvedValue({ locations: [] })`.
- Mock `api` in `createMockedDomainModule('client', { default: { get: vi.fn().mockResolvedValue({ studies: [] }) } })` with unwrapped bodies.
- Keep `{ data: [] }` only when testing code that consumes `ApiResponse` list helpers (`specimenTypesApi.list()` return type).
- Do not mock `status`, `statusText`, `headers`, or `config` on domain API mocks unless testing `axiosApi` directly.

## Consequences

- Older tests that still use axios-shaped mocks must be updated (see migration in the same PR as client unwrap).
- New code should not import a removed `lib/api` barrel; import from `lib/api/<domain>`.
