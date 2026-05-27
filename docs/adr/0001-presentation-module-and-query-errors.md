# Presentation module and inline query errors

---
status: accepted
---

SampleDB’s web client uses `packages/web/src/ui/` as a presentation module: a query-agnostic `PresentationStatus` (`loading` | `error` | `empty` | `ready`), thin adapters from TanStack Query (`fromQuery`), and shared primitives (`AsyncPresentation`, `PageError`, `SectionMessage`, `EmptyState`, `Button`, skeletons).

**Read-path errors** on migrated screens are shown inline (`PageError` with retry, or section-level `SectionMessage` on secondary queries). Query hooks used there do not toast on fetch failure. **Write-path errors** (mutations) continue to use toast notifications or inline mutation banners where already present.

**Mutations** should go through domain hooks (e.g. `useCreateStudy`, `useCreateQpcrExperiment`) so `queryClient.invalidateQueries` refreshes list pages and dashboard widgets (`dashboardKeys`) that use separate query keys from the main list.

We rejected coupling the presentation seam to React Query types (callers still need per-section status outside a single query boundary) and rejected toast-only read errors (several list pages previously failed silently with `console.error` only).

## Migrated routes (read paths)

- Studies list/detail, StudyCard
- Specimens list/detail
- Dashboard, Subject detail
- Collections list; collection detail (cryovial box, micronix plate, box, bag, sheet)
- Container detail (main + derivations/source queries)
- Blood controls overview; control definition/batch detail; composition detail
- Locations tree browser and location detail page
- qPCR experiments list and experiment detail
- Statistics, Settings (initial load)
- Reference Data (per-tab list load + specimen-type container types via `useQueries`)
- Admin dashboard, system statistics, users, error logs, data-integrity overview/report/empty collections
- Collection move and paper (sheet) move workflows (initial bootstrap reads)
- Container move cryovial and micronix (initial bootstrap reads)
- **Auth:** Login, Register, Setup, SetupGuard (`useAuthWorkflow.ts`)
- **Control batch wizard (read paths):** wizard bootstrap (`useControlBatchWizardBootstrap`, `useControlDefinitionWizardSeed`, `useCompositionDefinitionsByKey`), batch-info catalogs (`useControlDefinitionsList`, `useStrains`, `useControlDefinitionDetail`), specimen-types step constraints (`useSpecimenTypeContainerTypesForId`, `useSpecimenTypesByContainerType`), specimen-type catalog on CSV/specimen steps
- **Export / BarcodeExport / PlateScanValidation:** bootstrap via `useExportWorkflow.ts`
- **Derivations bulk import:** bootstrap via `useDerivationsBulkImportBootstrap`
- **Collection specimen entry:** studies + specimen types catalogs
- **Import (`BulkImportFlow`):** template specimen types + collection check reads
- **SpecimenForm:** bootstrap via `useSpecimenFormCatalogs`
- **SubjectForm:** study display via `useStudy`

## Workflow write paths (intentionally local state)

CSV parse, server validate, export submit, bulk create/import submit, batch name validation API calls, and multi-step wizard review/submit remain local state with inline or toast errors. These are not query read paths.

## Presentation module

- **Skeletons:** canonical under `ui/skeleton/` (`SkeletonList`, `SkeletonCard`, `SkeletonTable`, `LocationDetailsSkeleton`, `StudyCardSkeleton`, `DetailPageSkeleton`, `StudyListSkeleton`). Import from `../ui`.
- **Modal:** shared `ui/Modal` wraps `ModalPortal` for portaling. Migrated: pickers (`StudyPicker`, `LocationPicker`, …), forms (`ReferenceDataForm`, `LocationForm`), container modals, `ExportModal`, nested study pickers in `SpecimenFilter` / `StatisticsFilter`, admin user/error-log/data-integrity modals, `Locations` delete confirm, control-batch modals. **Still on `ModalPortal` directly:** `CommandPalette`, `SearchModal` (palette-specific layout/CSS).
- **Browser smoke:** `packages/e2e/tests/presentation-smoke.spec.ts` — login plus dashboard, studies, specimens, and settings.

## Follow-up (outside migrated read paths)

- **ExportModal / Export.tsx:** count and export submit still use local error state (shell uses `ui/Modal`)
- **ContainerEditModal, etc.:** modal-internal catalog loads
- **ContainerRegistration, ContainerDefaultsForm:** unit/tag loads with `console.error`
- **qPCR detail:** some write paths may bypass `invalidateQpcrExperimentQueries`

Consequences: command palette and global search keep bespoke overlay markup until a dedicated variant or shared palette styles exist.
