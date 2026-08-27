# Specimen source resolution and one rich Source shape

---
status: accepted
---

Resolving a **Specimen**'s [**Source**](../../CONTEXT.md) — the **Subject** (via a **Study**) or the **Control batch** it came from — was copy-pasted across five read paths: `GET /containers/:id`, `GET /derivations/...`, collection container detail, qPCR well enrichment, and **Container export**. Each copy ran its own joins and returned a slightly different shape: some flattened `definitionName`, derivations nested `definition: { id, name }`, container detail added `targetDensity` / `strainComposition`, qPCR omitted them. A row that resolved one way in the export path could resolve differently in a route, and there was no single place to test source resolution.

We resolve **Source** through one module and serialize it as **one rich shape everywhere**.

## One resolver module

`packages/api/src/lib/specimens/provenance.ts` owns source resolution behind two functions:

- `resolveSpecimenSource(db, specimenId)` — one specimen.
- `resolveSpecimenSources(db, specimenIds)` — batch; returns `Map<number, SpecimenSource | null>`.

All five read paths call these instead of running their own subject/control joins. Batch callers (qPCR wells, container export, collection detail) use the map form to avoid N+1 queries.

## One rich Source shape

`SpecimenSource` is a **discriminated union on `type`** (`'subject' | 'control'`), and it is a **superset** — it carries every field any consumer needs, not the minimum for a given caller:

- **Subject**: `id`, `name`, and the full `study` chain (`id`, `title`, `code`, `leadPerson`).
- **Control**: `id`, `name`, `productionDate`, `controlType`, `definitionName`, nested `definition`, `targetDensity`, `targetDensityUnit`, `strainComposition`.

Consumers that need less **ignore the extra fields**; they do not get their own narrower shape. This is safe because optional fields are omitted on the wire ([ADR 0005](./0005-wire-dto-omit-on-wire.md)) — a `null` `targetDensity` simply does not appear in JSON, so a client that never reads it is unaffected. Adding a field to `SpecimenSource` is an **additive** wire change, never a breaking one.

### Why superset over per-caller shapes

Per-caller shapes were the source of the original drift. A single rich shape means:

- One projection to maintain and test, not four.
- New source attributes reach every consumer without touching each call site.
- The web client parses one `Source` type regardless of which endpoint returned it.

## Specimen summary on the wire

Container read paths also attach a **Specimen** summary alongside the source. That summary is typed by `specimenSummaryWireSchema` in `@sampledb/contract/wire` (`id`, `studySubjectId`, `controlBatchId`, `specimenTypeId`, `collectionDate`, `created`, `lastUpdated`, optional `specimenType`). Audit columns (`createdBy` / `updatedBy`) are **not** on the wire. The API's `GET /containers/:id` projection and the collection-detail enrichment are both pinned to this contract type so persistence rows cannot leak past the seam ([ADR 0005](./0005-wire-dto-omit-on-wire.md)).

## Consequences

- Source resolution has dedicated unit tests (subject, control, missing specimen, strain/density edge cases, batch) instead of being exercised only incidentally through route tests.
- `EnrichedStorageContainer.specimen` and the `GET /containers/:id` `specimen` field reference `SpecimenSummaryWire`, not Drizzle `$inferSelect` rows.
- The export path's bespoke control-batch / definition / unit / strain lookups are deleted in favor of `resolveSpecimenSources`; export still projects to its own CSV columns from the rich object.
- Web consumers must tolerate extra `Source` fields (they already ignore unknown keys); narrowing the shape per endpoint is disallowed.

## Related ADRs

- [ADR 0005: Wire DTO layer and omit-on-wire JSON](./0005-wire-dto-omit-on-wire.md) — makes the superset additive rather than breaking, and owns the specimen summary wire shape
- [ADR 0006: Unified container inbound write](./0006-unified-container-inbound-write.md) — sibling consolidation on the write path

## Non-goals

- Changing how **Source** alternates beyond Subject / Control batch (Reagent, Cell line, etc. per `CONTEXT.md`) are modeled — only subject and control are resolved today.
- A unified container read view — completed in [ADR 0009](./0009-container-read-view.md).
- Caching or memoizing resolution across requests.
