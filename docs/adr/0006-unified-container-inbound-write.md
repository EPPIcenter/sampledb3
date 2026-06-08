# Unified container inbound write shape

---
status: accepted
---

Outbound container wire DTOs ([ADR 0005](./0005-wire-dto-omit-on-wire.md)) split **Container placement** from identity on read paths. Inbound writes were still fragmented — three field-name dialects (`containerType` vs `type`, `barcode` vs `containerBarcode`), flat placement fields, parallel persistence in control-batch and derivation code, and CSV columns that did not match the wire model.

We unify all container writes on one contract type and one API executor. **No backwards-compatibility shims** — hard cutover on request JSON and CSV column names.

## ContainerWriteInput

`@sampledb/contract` exports `ContainerWriteInput`: a **discriminated union on `containerType`** that mirrors the outbound wire shape ([ADR 0005](./0005-wire-dto-omit-on-wire.md)):

- **Identity** on the variant root: `barcode` (micronix/cryovial), `sublabel` (paper).
- **Placement** on `collection` — not flat `collectionName` / `collectionType` / `collectionId` siblings.

### Paper placement

A paper container's immediate **Collection** is its **Sheet**. On write:

```json
{
  "containerType": "paper",
  "sublabel": "Spot-A",
  "collection": {
    "type": "sheet",
    "name": "Sheet-1",
    "parent": {
      "type": "box",
      "name": "PaperBox",
      "locationId": 42
    }
  }
}
```

- When `collection.id` is present, resolve the existing sheet; skip parent resolution.
- When absent, require `name` plus `parent` (`box` or `bag`, by id or by name + `locationId` for create-by-name).
- Do **not** express paper placement as a box/bag `collection` with a sibling `sheetName`.

Tube and well variants use `collection` with `micronix_plate` or `cryovial_box` and optional grid `position`.

## One shape, every endpoint

All container-bearing write endpoints validate the same `ContainerWriteInput` (or arrays thereof). Endpoint-specific field names are removed:

| Removed dialect | Replacement |
|-----------------|-------------|
| `type` | `containerType` |
| `containerBarcode` | `barcode` |
| Flat `collectionName`, `collectionType`, `collectionLocationId`, `sheetName` | Nested `collection` |
| Derivation `sheetParentType` / `sheetParentName` | `collection.parent` on sheet |
| Control-batch `createCollections` sidecar | Create-by-name via `collection.parent` + `locationId` in each input |

Affected routes include specimen container create, bulk combined import, control batch create-with-specimens, and derivation create.

## Single API write executor

All persistence funnels through `createContainerForSpecimen` (accepting `ContainerWriteInput`) after `resolveContainerPlacement`. Delete parallel implementations:

- `batch-with-specimens` `prepareContainerData` / `createContainerSync`
- Inline subtype inserts in `derivations.ts` for child containers

Placement resolution (sheet find-or-create within box/bag, plate/box resolve) lives in one module — not duplicated across registration, control batch, and derivation CSV.

## CSV

One contract mapper — `csvRowToContainerWriteInput` — maps flat CSV rows to `ContainerWriteInput`, then Zod validates.

- Paper identity column: **`sublabel` only** — no `barcode` alias.
- Paper parent: **either** `box_name` **or** `bag_name` (exactly one required, mutually exclusive).
- Derivation CSV child paper rows require `sheet_name`.
- Delete `mapPaperInboundFromLegacyRow` and paper-specific tube-column rejection helpers; schema validation replaces them.

## Web UI

Interactive forms keep **flat form state** (box/bag picker, sheet name field, sublabel field). A submit-time mapper builds nested `ContainerWriteInput` — forms are not restructured to nested sheet pickers.

Paper forms add `parentCollectionType: 'box' | 'bag'` (default **`box`**) with a box/bag toggle, matching the control-batch wizard. Collection options reload when parent type changes.

The derivation create modal is an exception: it selects an **existing sheet by id** only (no create-by-name with box/bag parent). Registration, bulk import, and control-batch paths support create-by-name.

## Implementation gate

Refactor in **vertical slices**; do not delete parallel code until a **write-path parity matrix** passes:

1. Contract schemas and CSV mapper tests (all container types × existing vs create-by-name × box vs bag).
2. Unified API executor with expanded parity tests (specimen POST, bulk combined, control batch, derivation must produce identical DB rows for equivalent inputs).
3. Routes migrated one at a time, each with an integration test on the new request shape.
4. Web mappers and component tests last.

Run `bun run ci:verify` before merge.

## Consequences

- `@sampledb/contract` gains a `write/` (or equivalent) module alongside `wire/`; inbound and outbound container vocabulary stay aligned.
- Endpoint-specific container Zod forks are deleted once routes migrate; inbound validation uses `containerWriteInputSchema` and contract refiners (`refinePaperContainerInboundWrite`).
- Bulk import required columns for paper change from bag-only to box-or-bag; control-batch CSV templates use `sublabel` not `barcode`.
- External API clients must adopt `ContainerWriteInput` JSON; there is no translation layer.

## Related ADRs

- [ADR 0005: Wire DTO layer and omit-on-wire JSON](./0005-wire-dto-omit-on-wire.md) — outbound wire shape this mirrors
- [ADR 0002: HTTP client response unwrap](./0002-http-client-response-unwrap.md) — web imports shared contract types
- [ADR 0003: SQLite schema evolution](./0003-sqlite-schema-evolution.md) — storage layer unchanged; this is request-shape and routing only

## Non-goals

- Changing outbound `EnrichedContainerWire` read shape
- Nested sheet pickers in interactive UI
- Accepting legacy CSV `barcode` as paper sublabel alias
- OpenAPI regen
