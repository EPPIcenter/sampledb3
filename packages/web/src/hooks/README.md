# Query hooks

Domain read hooks use TanStack Query. Mutations invalidate related caches explicitly — do not rely on shorter `staleTime` or `refetchOnMount` as a substitute.

## Invalidation checklist

After a **write**, ask:

1. **List pages** — invalidate the domain `Keys.lists()` (or `Keys.all` when list/detail share a prefix).
2. **Dashboard widgets** — call `invalidateDashboardQueries(queryClient)` when the entity appears on the dashboard (studies, specimens, subjects, qPCR, etc.).
3. **Detail context** — invalidate parent detail queries when the write affects a nested view (study subjects/summary after specimen create, control batch summary after control specimen create).

### Shared helpers

| Helper | Use after |
|--------|-----------|
| `invalidateDashboardQueries` | Any create/update/delete that changes dashboard counts or widgets |
| `invalidateSpecimenQueries` | Specimen create (via `useCreateSpecimen`) |
| `invalidateQpcrExperimentQueries` | qPCR experiment create, delete, settings save, plate upload, results upload |

### Examples

**Study create** (`useCreateStudy`):

```typescript
queryClient.invalidateQueries({ queryKey: studyKeys.lists() })
queryClient.invalidateQueries({ queryKey: studyKeys.infinite() })
invalidateDashboardQueries(queryClient)
```

**Specimen create** — prefer `useCreateSpecimen`; it calls `invalidateSpecimenQueries` with the API response (including `studyId` when the source is a subject).

**Merged settings** (e.g. scanner configs for move workflows) — use `settingsApi.getValue('scanner_configurations')`, not a raw `api.get` on `/settings/:key`. That route returns `{ key, value }`.

**Direct API writes** — if a page still calls an API module directly, call the matching invalidation helper in the success path. Do not skip dashboard keys when list and dashboard use different query keys.

## Mutation error UX

- **Page-level actions** — hooks toast on mutation failure (default).
- **Forms with inline error banners** — pass `{ silent: true }` to the hook so the form owns error display (`StudyForm`, `SpecimenForm`).

Success toasts remain on the hook unless the caller handles those too.

## Read-path errors

Query hooks do not toast on fetch failure. Pages use `PageError` / `SectionMessage` via `fromQuery` (see ADR 0001).
