# Unified Container read view

---
status: accepted
---

Container list, `GET /containers/:id`, collection detail, and **Container export** each assembled **Container placement**, identity, **Tags**, **Specimen** summary, and **Source** with a different enricher. ADR 0007 unified Source resolution but left payload assembly to each read path. Export still re-queried `studySubject` after calling `resolveSpecimenSources`. `GET /containers/:id` joined Specimen and Source in the route.

We load one operational **Container read view** and project.

## One load module

`packages/api/src/lib/container-read-view.ts` owns `loadContainerReadViews(db, containers)` and `loadContainerReadViewsByIds(db, ids)`. The view is a **superset**: placement, identity subtypes, Tags, unit, location, Specimen summary (with type), and Source. Callers that need less ignore extra fields.

- List / derivations / PATCH map to `EnrichedContainerApi` (placement + tags; drop Specimen and Source).
- Collection detail maps to `EnrichedStorageContainer` (Specimen + Source + Tags).
- Container export maps to CSV row fields from the same view — subject name comes from Source, not a second `studySubject` query.
- `GET /containers/:id` returns wire container + Specimen + Source from one load.

## Tests

The view has its own seam tests (placement + Tags + Specimen + Source together). Existing enrich and route tests stay as projection/envelope checks.

## Related ADRs

- [ADR 0007](./0007-specimen-source-resolution.md) — Source shape this view consumes; this ADR completes its deferred unified container read view
- [ADR 0005](./0005-wire-dto-omit-on-wire.md) — wire mapping still happens after the view

## Non-goals

- Changing outbound `EnrichedContainerWire` or Source shape
- Unifying Container export `run*` executors or collection-detail presentation
