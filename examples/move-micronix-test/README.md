# Move Micronix Tubes – Test CSVs

These CSVs are generated from your production database for testing the **Move Micronix Tubes** workflow. Tubes move in a cycle between plates (e.g. Plate A → Plate B → Plate C → Plate A).

## Generating the CSVs

From the repo root, with your production database (e.g. `sampledb_database.sqlite`):

```bash
./scripts/generate_move_micronix_test_csvs.sh [path-to-database]
```

- **Default DB path:** `./sampledb_database.sqlite` (or `sampledb_database.sqlite` in the repo root).
- **Output:** 3 CSV files in this folder (`examples/move-micronix-test/`). Each filename is the **destination** plate name (e.g. `PlateB.csv` = tubes moving to Plate B).
- **Requirements:** At least 2 micronix plates with at least one tube each. With 3 plates, the script produces a full cycle; with 2 plates, it produces two files (A→B, B→A).

## Using the CSVs in the App

1. Go to **Move Micronix Tubes** (Storage → Move Micronix Tubes or command palette).
2. Select scanner config **Traxcer** (default), which uses columns **Tube ID** and **Position**.
3. Upload the 3 CSV files. The destination plate for each file is inferred from the filename (exact match to plate name); if not matched, choose the destination from the dropdown.
4. Click **Resolve** to resolve barcodes, then confirm source/destination and positions.
5. Click **Execute Moves**. After the run, tubes will have moved in a cycle (e.g. A→B, B→C, C→A).

## CSV Format

- **Headers:** `Tube ID`, `Position` (Traxcer scanner config).
- **Rows:** One row per tube — barcode (Tube ID) and target well position (e.g. A01, B12) on the destination plate.
- **Filename:** Must match the destination plate name so the UI can auto-select the destination.

For more on container movement, see [Container Movement](/guides/bulk-operations/container-movement/) in the SampleDB documentation.
