# Presentation module and inline query errors

---
status: accepted
---

SampleDB’s web client uses `packages/web/src/ui/` as a presentation module: a query-agnostic `PresentationStatus` (`loading` | `error` | `empty` | `ready`), thin adapters from TanStack Query (`fromQuery`), and shared primitives (`AsyncPresentation`, `PageError`, `SectionMessage`, `EmptyState`, `Button`, skeletons).

**Read-path errors** on migrated screens are shown inline (`PageError` with retry, or section-level `SectionMessage` on secondary queries). Query hooks used there do not toast on fetch failure. **Write-path errors** (mutations) continue to use toast notifications or inline mutation banners where already present.

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

## Intentionally not migrated (workflows, auth, heavy editors)

- Container move (micronix/cryovial), export/import, plate-scan validation, derivations bulk import
- Login, Register, Setup
- Bulk-import and wizard steps
- Reference Data tab dependency loads (inline `useEffect`; failures logged)

Consequences: remaining workflow pages may still use mutation-local error state on file/CSV steps; skeleton components under `components/` re-export from `ui/skeleton/` during transition.
