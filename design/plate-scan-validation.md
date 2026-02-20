# Plate Scan Validation

## Goal

Allow users to upload a scanned plate CSV and compare it to a micronix plate in the database. The filename is used to suggest a plate (with fuzzy matching when filenames include dates/times). The result shows whether the scan matches the DB and highlights missing entries, mismatches, and wells that are exhausted or have tags.

## Flow

1. User uploads a CSV file (scanner output) and selects a scanner configuration.
2. User chooses how to identify the plate:
   - **I know the plate**: From the filename, the app suggests plates; user confirms or selects the plate from the list.
   - **Infer plate from scan**: No plate selection. The system infers the plate from the barcodes in the scan (all tubes must belong to the same plate).
3. User clicks Validate. The API parses the CSV; if a plate was selected, it validates against that plate; if "Infer" was chosen, it first infers the plate from barcodes, then runs the same validation.
4. Result shows summary counts (matched, mismatch, missing in scan, extra in scan, exhausted, tagged) and a well-level table. When the plate was inferred, the result is labelled "Result: PlateName (inferred)" and the CSV report includes "Inferred plate,Yes".

## Filename → plate inference (fuzzy)

- **Stem extraction**: Remove extension, then strip patterns such as `_2024-01-15`, `_20240115`, `_143000`, `_20240115_143000`, etc. The remaining string is the stem.
- **Matching** (given stem and list of plate names): Exact (case-insensitive) first, then plate name contains stem, then stem contains plate name. Candidates are sorted by match type and then by plate name length (shorter preferred when tied).
- Implemented in `packages/web/src/lib/plate-filename-match.ts` for reuse (e.g. by container move in a follow-up).

## API

- **Endpoint**: `POST /api/collections/plates/micronix/validate-scan` (auth + member).
- **Request**: `{ csvText, scannerConfigurationId, plateId? }`. `plateId` is optional. When omitted, the server infers the plate from the scan barcodes, then runs validation against that plate.
- **Inference** (when `plateId` omitted): Parse CSV; collect non-empty barcodes; look up each barcode in `micronix_tube` (joined with plate). All barcodes must exist and belong to the **same** plate. Errors: no barcodes → "Cannot infer plate: scan has no barcodes"; unknown barcode(s) → "Unknown barcode(s): …"; multiple plates → "Tubes from multiple plates: Plate1, Plate2". On success, returns same result shape with `inferredPlate: true`.
- **Behavior** (with or without plateId): Load scanner config; parse CSV via shared `parsePlateCSV` (from `packages/api/src/lib/plate-csv.ts`); load plate and its tubes/static wells; for each container load `remainingQuantity` and tags; build expected map by position; compare with scanned map; return plate, summary, wells array, and optionally `inferredPlate: true`.
- **Status values**: `match`, `mismatch`, `missing_in_scan`, `extra_in_scan`. Empty barcode in scan at a position is treated as "scanned empty": DB has tube → missing_in_scan; DB has no tube → extra_in_scan. Duplicate positions in CSV: last wins.
- **Exhausted**: `remainingQuantity != null && remainingQuantity <= 0`.

## Shared parsing

- `normalizeWellPosition`, `validateWellPosition`, and `parsePlateCSV` live in `packages/api/src/lib/plate-csv.ts`. qPCR plate upload imports them from there so both flows use the same logic.

## Frontend

- **Route**: `/plate-scan-validation`. Page: upload CSV, scanner config dropdown, plate mode choice ("I know the plate" vs "Infer plate from scan"), plate picker when "I know the plate" (with filename-based candidates), Validate button, then summary card and well table. When result was inferred, the heading shows "Result: PlateName (inferred)" and a short note. Uses `.storage-page` and `storage.css` (modern precision lab theme).
- **Navigation**: Under Operations, as a sibling to Move Containers and Move Collections ("Validate plate scan").

## Docs

- User guide: `packages/docs/src/content/docs/guides/features/plate-scan-validation.md`. Sidebar: Specialized Features → Validate Plate Scan.

## Out of scope

- Updating container move to use fuzzy filename matching (follow-up).
- Writing scan data back to the database (validation is read-only).
