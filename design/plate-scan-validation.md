# Plate Scan Validation

## Goal

Allow users to upload a scanned plate CSV and compare it to a micronix plate in the database. The filename is used to suggest a plate (with fuzzy matching when filenames include dates/times). The result shows whether the scan matches the DB and highlights missing entries, mismatches, and wells that are exhausted or have tags.

## Flow

1. User uploads a CSV file (scanner output) and selects a scanner configuration.
2. From the filename, the app extracts a "stem" (plate name) by stripping `.csv` and common date/time suffixes, then finds matching plates (exact, contains, or reverse contains).
3. User confirms or selects the plate to validate against.
4. User clicks Validate; the API parses the CSV, loads the plate's wells (with barcode, remainingQuantity, tags), and compares position-by-position.
5. Result shows summary counts (matched, mismatch, missing in scan, extra in scan, exhausted, tagged) and a well-level table with status and notes.

## Filename → plate inference (fuzzy)

- **Stem extraction**: Remove extension, then strip patterns such as `_2024-01-15`, `_20240115`, `_143000`, `_20240115_143000`, etc. The remaining string is the stem.
- **Matching** (given stem and list of plate names): Exact (case-insensitive) first, then plate name contains stem, then stem contains plate name. Candidates are sorted by match type and then by plate name length (shorter preferred when tied).
- Implemented in `packages/web/src/lib/plate-filename-match.ts` for reuse (e.g. by container move in a follow-up).

## API

- **Endpoint**: `POST /api/collections/plates/micronix/validate-scan` (auth + member).
- **Request**: `{ csvText, plateId, scannerConfigurationId }`.
- **Behavior**: Load scanner config; parse CSV via shared `parsePlateCSV` (from `packages/api/src/lib/plate-csv.ts`); load plate and its tubes/static wells; for each container load `remainingQuantity` and tags; build expected map by position; compare with scanned map; return plate, summary, and wells array (position, scanBarcode, expectedBarcode, status, exhausted, tags).
- **Status values**: `match`, `mismatch`, `missing_in_scan`, `extra_in_scan`. Empty barcode in scan at a position is treated as "scanned empty": DB has tube → missing_in_scan; DB has no tube → extra_in_scan. Duplicate positions in CSV: last wins.
- **Exhausted**: `remainingQuantity != null && remainingQuantity <= 0`.

## Shared parsing

- `normalizeWellPosition`, `validateWellPosition`, and `parsePlateCSV` live in `packages/api/src/lib/plate-csv.ts`. qPCR plate upload imports them from there so both flows use the same logic.

## Frontend

- **Route**: `/plate-scan-validation`. Page: upload CSV, scanner config dropdown, plate picker (with filename-based candidates), Validate button, then summary card and well table. Uses `.storage-page` and `storage.css` (modern precision lab theme).
- **Navigation**: Under Operations, as a sibling to Move Containers and Move Collections ("Validate plate scan").

## Docs

- User guide: `packages/docs/src/content/docs/guides/features/plate-scan-validation.md`. Sidebar: Specialized Features → Validate Plate Scan.

## Out of scope

- Updating container move to use fuzzy filename matching (follow-up).
- Writing scan data back to the database (validation is read-only).
