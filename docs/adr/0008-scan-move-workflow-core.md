# Scan move workflow core

---
status: accepted
---

The two CSV-driven container move pages (`ContainerMoveMicronix.tsx` ~1,375 lines, `ContainerMoveCryovial.tsx` ~1,012 lines) duplicated one workflow state machine in-page: file ingest → destination inference → batch container resolve (grouped per file) → source→destination mapping with conflict detection → atomic move execution with per-file results. The only test surface was the rendered page (`ContainerMoveMicronix.test.tsx` reached 1,527 lines with full router and API module mocks). Cryovial additionally kept an untested inline CSV parser (naive `split(',')`) and inline filename matching that predated the scanner-plate libs.

We deepen this into one **Scan move** module (see [CONTEXT.md](../../CONTEXT.md)): a framework-free workflow core in `packages/web/src/lib/scan-move/`, consumed through one thin hook, with the two pages as shells.

## Core shape: reducer + effects

- **Pure reducer** `(state, event) → state` owns files, step, destination selections, atomic mode, and move result. Step transition guards (no files → upload; missing destinations → create step) are pure functions.
- **Effect functions** (`ingestScanFiles`, `resolveScanMove`, `createDestinations`, `executeScanMove`) are async, never touch state, and **return events** that the hook dispatches. Heavy logic inside effects (resolve grouping, relocation validation, move-plan building, per-file results) is exported as pure functions.
- **Gateway port**: effects receive a small `ScanMoveGateway` interface (resolve, move, wells lookup, destination create) instead of importing `collectionsApi`. Production uses the `collectionsApi` adapter; tests pass plain stub functions — no `vi.mock`.
- **Step ownership**: core state owns the current step; the hook mirrors it to the URL one-way (`?step=`). Deep links land on a guard-checked step. Existing step values (`upload`, `create_plates`, `resolve`, `execute`) are kept for URL stability.

## Variant adapter (two adapters = real seam)

`ScanMoveVariant` is the only place micronix and cryovial differ:

- **Identity**: micronix resolves by `barcode` (empty barcode = empty well, row skipped); cryovial resolves by `position` (`sourceCollectionName` + `sourcePosition`, every row moves).
- **CSV spec**: micronix uses lab-configurable **scanner configurations** (settings) via the existing `scanner-plate-csv` / `plate-destination-inference` libs; cryovial uses a **built-in, code-level CSV spec** (fixed columns `source_collection_name`, `source_position`, `target_position`) parsed by the core's robust CSV tokenizer — not visible or editable in Settings.
- **Capabilities**: `createDestinations` (a destination name matching no existing collection routes through a create step with location assignment; filename stems with no match auto-propose a new collection) is enabled for **both** variants. `relocationValidation` ("position emptied in upload but tube currently there is not relocated") is micronix-only — cryovial moves are position-addressed and do not assert full-box scans.

## Migration gate

Vertical slices with parity, mirroring [ADR 0006](./0006-unified-container-inbound-write.md):

1. Core + unit tests; no page changes.
2. Micronix page onto the hook; the existing 1,527-line page test stays green as the safety net.
3. Cryovial page onto the hook with the built-in spec.
4. Page tests pruned to wiring smoke once core tests cover the scenarios; `PlateScanValidation` may later adopt the exported ingest stage (its second consumer).

## Considered options

- **One deep React hook holding all logic** — rejected; the dominant logic is pure data transformation trapped in `setState` closures today, and hook-shaped tests still need renderer plumbing.
- **Two per-variant hooks sharing pure helpers** — rejected; keeps the state machine duplicated, which is the original friction.
- **Extending scanner-configuration reference data to express position-based cryovial formats** — rejected for now; no lab demand for configurable cryovial formats, and it widens a settings surface for one fixed format.
- **URL as step source of truth** — rejected; the guard logic already overrode the URL, so the URL was a mirror pretending to be an owner.
- **Composing create-plates and relocation validation in the page** — rejected; they are workflow stages, and leaving them page-side keeps the micronix page deep enough to re-grow.

## Consequences

- Cryovial CSV parsing becomes robust (quoted fields parse correctly); lab-facing column names are unchanged. This is a deliberate behaviour change.
- Relocation errors are tagged structurally (`kind: 'relocation'`) instead of matched by error-message substring.
- New scan-move behaviour lands in the core with plain-data unit tests; page tests assert wiring only.
- The ingest stage (`parse → validate → infer destination`) is exported separately; `PlateScanValidation` consumes it as the second consumer (plate inference only — it filters to `kind: 'inference'` errors because format rules like the full-plate check are exactly what that page reports against the database, not preconditions). This also gives it the move pages' auto-selection semantics (one exact filename match wins over contains-matches).

## Related ADRs

- [ADR 0006: Unified container inbound write shape](./0006-unified-container-inbound-write.md) — the parity-gated migration discipline this follows
- [ADR 0001: Presentation module and inline query errors](./0001-presentation-module-and-query-errors.md) — bootstrap reads stay on query hooks; workflow submit/resolve calls remain local state per its workflow write-path policy

## Non-goals

- Changing the interactive paper move workflow (not CSV-driven)
- Changing move API request shapes or server-side move semantics
- Making the cryovial CSV format configurable
