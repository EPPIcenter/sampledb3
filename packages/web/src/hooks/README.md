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
| `invalidateAfterBulkWrite` (`lib/query-client.ts`) | A write whose records many pages show; see the table below |
| `invalidateAfterReferenceDataWrite` | Any Reference data create, update or delete, and a specimen type's allowed container types |

### Writes that invalidate every query

These writes change records that Collection grids, Specimen lists, study and Subject pages, Controls and the dashboard all show, so a list of keys would miss some. They call `invalidateAfterBulkWrite`, which invalidates every query: queries on screen refetch now and the rest refetch when next used. Pass the keys of records the write deleted as `deleted`, so they are marked stale without refetching into a 404.

| Write | Hook or call site | `deleted` |
|-------|-------------------|-----------|
| Container edit | `useUpdateContainer` | — |
| Derivation | `useCreateDerivation` | — |
| Add a Container to a Specimen | `useAddSpecimenContainer` | — |
| Subject merge | `useMergeSubjects` | source `subjectKeys.detail` |
| Delete a Specimen from a Control batch | `useDeleteControlBatchSpecimen` | `specimenKeys.detail`, `specimenKeys.containers` |
| Delete a Control batch | `ControlBatchDetail` | — (the page navigates away) |
| Reference data create, update, delete | `invalidateAfterReferenceDataWrite` (Reference Data page and the `useReferenceData` mutation hooks) | the item's detail key and, for a specimen type, its container types |
| Collection delete with contents | `useDeleteCollectionWithContents` | `collectionKeys.detail` |
| Study delete | `StudyDetail` | — (removes `studyKeys.detail` first) |
| Bulk import, derivations import, Control batch wizard, scan move, paper move, Collection move | the workflow hooks and pages | — |

Study cards on the Studies page load through `useStudySummaryCards`, which refetches an invalidated card when it is on screen or next comes into view.

### Examples

**Study create** (`useCreateStudy`):

```typescript
queryClient.invalidateQueries({ queryKey: studyKeys.all })
invalidateDashboardQueries(queryClient)
```

**Specimen create** — prefer `useCreateSpecimen`; it calls `invalidateSpecimenQueries` with the API response (including `studyId` when the source is a subject).

**Settings by key** — use `settingsApi.getValue` / `settingsApi.putValue` (or `update`, which delegates to `putValue`) for `GET`/`PUT /settings/:key`. Those routes return `{ key, value }` (and optional `userId` on PUT), not the setting value at the top level. For export/scanner admin UIs, pass `{ scope: 'shared' }` or `{ scope: 'personal' }`; workflows use the default merged `effective` scope.

**Direct API writes** — if a page still calls an API module directly, call the matching invalidation helper in the success path. Do not skip dashboard keys when list and dashboard use different query keys.

## Mutation error UX

- **Page-level actions** — hooks toast on mutation failure (default).
- **Forms with inline error banners** — pass `{ silent: true }` to the hook so the form owns error display (`StudyForm`, `SpecimenForm`).

Success toasts remain on the hook unless the caller handles those too.

## Read-path errors

Query hooks do not toast on fetch failure. Pages use `PageError` / `SectionMessage` via `fromQuery` (see ADR 0001).
