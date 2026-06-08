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
3. Upload the CSV files. The destination plate for each file is inferred from the filename; confirm or pick from the list.
4. Click **Next: Resolve Containers** (destination plates must already exist for these files).
5. Review resolved tubes on the **Resolve** step, then click **Execute Moves**.

After the run, tubes will have moved in a cycle (e.g. A→B, B→C, C→A).

## CSV Format

- **Headers:** `Tube ID`, `Position` (Traxcer scanner config).
- **Rows:** All 96 wells (A01–H12), one row each. Barcode in **Tube ID** for occupied wells; empty cell for empty wells.
- **Filename:** Should match the destination plate name so the UI can auto-select it.
