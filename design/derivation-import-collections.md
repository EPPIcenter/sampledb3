# Derivation Import: Missing Collections and Dry Run

## Goal

Fix derivation bulk import so that (1) validation and dry run do not fail or persist when collections are missing, (2) missing collections can be created before import (like specimen batch import), and (3) dry run is validation-only and does not write to the database.

## Approach

Mirror the specimen bulk import flow: **validate → create missing collections (with location) → import**. Collection creation is not done inside the derivation import API; the user assigns locations in the UI and collections are created via existing collection APIs, then import runs.

## Design choices

- **Dry run is non-destructive.** When `dryRun: true`, the API does not call `createDerivation`. It resolves parent and collection for each row and returns per-row success or failure (e.g. "collectionId is required for micronix_tube derivations" when the collection does not exist). No rows are inserted.

- **Validation requires collection identifiers for tube types.** For `micronix_tube` and `cryovial_tube`, if a row has neither `collection_name` nor `collection_barcode`, validation marks the row invalid with a clear error. This avoids a later generic "collectionId is required" at import time.

- **Create missing collections step in the UI.** When validation returns collections with status `will_be_created` (for micronix_plate or cryovial_box), the derivation import page shows a "Create missing collections" section. The user assigns a location to each collection via `LocationPicker`, then clicks "Create collections & continue." The app creates each collection via `collectionsApi.createMicronixPlate` / `createCryovialBox`, then runs the real import (no dry run). Import resolves collections by name/barcode and succeeds.

- **Paper/sheet.** Creating new sheets or box/bag collections for paper derivations is out of scope for this change; only micronix_plate and cryovial_box are supported in the create-collections step.

## Files touched

| Area                    | File |
|-------------------------|------|
| API dry run             | `packages/api/src/lib/derivations-csv.ts` |
| API validation          | `packages/api/src/lib/derivations-csv.ts` |
| UI create-collections   | `packages/web/src/pages/DerivationsBulkImport.tsx` |
| Docs                    | `packages/docs/src/content/docs/guides/features/derivations.md` |
| Design                  | `design/derivation-import-collections.md` (this file) |

## References

- [design/bulk-import-specimen-deduplication.md](bulk-import-specimen-deduplication.md) — specimen import behavior
- Specimen bulk import "Create Collections" step in `packages/web/src/components/BulkImportFlow.tsx`
