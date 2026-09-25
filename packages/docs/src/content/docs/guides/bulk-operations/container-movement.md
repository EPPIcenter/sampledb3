---
title: Container movement
description: Move containers between collections
---

Move containers from one collection to another with **Operations → Move Containers**. There is no undo. To reverse a paper move, run a new move back to the original collection.

Three flows:

- **Move Micronix Tubes.** Upload one or more plate-scan CSVs. Each file describes the destination plate. Tubes are identified by barcode. The wizard can create a destination plate that does not exist yet.
- **Move Cryovial Tubes.** CSV identifies tubes by source box and source position. Destination box comes from the file name or the **Destination Box** picker.
- **Move Papers.** Visual picker of sheets, not CSV.

## Move micronix tubes

Micronix moves use a full plate-scan CSV, not a row-per-move spreadsheet. Each file is one destination plate after the move.

### CSV format

With the default **Traxcer** scanner configuration, the columns are **Tube ID** (barcode) and **Position** (target well on the destination plate, for example A01). Other scanners use different column names. Choose the matching layout in **Settings → Scanner configurations**.

Requirements:

- The CSV lists all 96 well positions (A01-H12) exactly once.
- A row with a barcode moves that tube to that well on the destination plate.
- Leave the barcode cell empty for wells that should be empty.
- Positions use **A01**: letter A-H plus two zero-padded digits. `A1` and `a1` are padded to `A01`.

**Destination plate name** comes from the file name by default, or from a CSV column that repeats the plate name on every row, depending on scanner configuration. Name the file after the destination plate, for example `PLATE-002.csv`. The system strips `.csv` and common date or time suffixes such as `_2024-01-15` when inferring the name.

When several CSVs target the same destination plate, they form one move. If a well is empty in your upload but currently has a tube on that plate, that tube must appear elsewhere in the move so it is relocated.

### Wizard

Open **Operations → Move Containers → Move Micronix Tubes**. Command palette: **Move Micronix Containers**. Up to four steps:

1. **Upload & Configure.** Select a scanner configuration, upload one or more CSVs, and confirm the destination plate for each file.
2. **Create Plates.** Only when a destination name does not exist. Assign a storage location and optional plate barcode, then continue.
3. **Resolve.** Lookup by barcode, list unresolved barcodes, choose atomicity.
4. **Execute.** Moves are committed. You see per-file results and errors.

If you change the scanner configuration after upload, the system re-validates.

For each file, confirm the **destination plate**:

- If the inferred name matches exactly one existing plate, it is selected. You can still pick a different plate or create a new one.
- If the name matches no plate, it is treated as a new plate. The UI shows that you assign a storage location on the next step.
- If several plates partially match, pick the correct one. Search by name, barcode, or location.

To create a plate with any name, open the destination plate picker and use **Create new plate**: enter the name and click **Use name**. The name does not have to match the file. For example, you can upload `PLATE-001.csv` and still target `PLATE-001-RUN2`. If your search text matches no existing plate, a **Create new plate: …** shortcut appears above the list. Names must be unique. If the name already exists, select that plate.

Click **Next: Create Destination Plates** when any destination is new, or **Next: Resolve Containers** when all destinations exist.

On **Create Plates**, pick a **location** for each new plate and optionally a **plate barcode**. Click **Create Plates & Continue**. If you return to this step after plates already exist, click **Continue to Resolve** so you do not create duplicates.

On **Resolve**, review source plates and unresolved barcodes. Fix the CSV on Upload if needed. Choose **atomicity mode**:

- **All-or-nothing (default):** any invalid row blocks all moves.
- **Best effort:** valid rows move; invalid rows are returned as errors.

Click **Execute Moves**. Use **Back** to return to Upload, or to Create Plates if destinations still need creating.

### Multiple files

Each file targets its own destination plate. In **Settings → Scanner configurations**, **Destination plate** can be **File name** (default) or **CSV column**. With **File name**, the stem is the file name without path, `.csv`, and common date suffixes, then matched against plate names (exact, then partial). With **CSV column**, the same plate name must appear on every data row; more than one distinct value rejects the upload.

If exactly one plate name equals the inferred stem, case-insensitive, that plate is selected even when other names only contain the stem. Stem `PLATE-A` selects `PLATE-A`, not `PLATE-A-BACKUP`. If there is no unique exact match but exactly one partial match, that plate is selected. Otherwise choose from the list.

Each source plate can map to only one destination across all files.

## Move cryovial tubes

Open **Operations → Move Containers → Move Cryovial Tubes**. Command palette: **Move Cryovial Containers**.

CSV columns: `source_collection_name`, `source_position`, `target_position`. There is no destination box column. Destination comes from the file name or the **Destination Box** picker. Click **Download Template** for headers. Position format must match the box layout, for example `A5` or `25`, and stay consistent within a box.

A move to an occupied target fails unless the occupying tube is also moved in the same batch. There is no overwrite option.

The wizard matches the micronix flow with box wording: upload, confirm **Destination Box**, **Next: Create Destination Boxes** if needed, assign locations, **Create Boxes & Continue**, then Resolve with the same atomicity modes.

## Move papers

Open **Operations → Move Containers → Move Papers**. Command palette: **Move Papers**.

1. Select the source box or bag. The page lists each sheet and how many papers it contains.
2. Select sheets. **Search sheets by name...** filters the grid. **Select All Visible** selects every sheet in the filtered list; it becomes **Deselect All Visible** when all visible sheets are selected.
3. Select a different destination box or bag.
4. On **Review & Confirm Move**, check the sheets, source, and destination, then click **Confirm Move**.

After the move, **Move Completed Successfully** shows how many sheets moved. Click **Start New Move** for another move. There is no undo.

## Validation and results

Before Resolve, relocation checks run: if a well is empty in the upload but occupied on the destination plate, that tube must appear at another position in the same batch.

Writes for the rows that will execute are still wrapped in a transaction, so a write-time failure rolls that set back. Paper movement has no atomicity choice; selected sheets move together.

After execution, micronix and cryovial results are per file. Paper shows sheet counts.

## Errors

- Unresolved micronix barcodes: they are listed on Resolve. Click **Back**, fix the CSV, then **Next: Resolve Containers**. You do not need to recreate destination plates that already exist.
- Relocation error on Upload (tube at an empty well not relocated): every tube currently on the destination plate must stay in place (barcode in that well) or appear at another well in the same batch.
- Occupied destination at execute: adjust positions or use a different atomicity mode.
- Source collection conflict: the same source collection appears in multiple files with different destinations. Split the operation or consolidate files that share a destination.

To move whole plates or boxes to a new freezer, see [Move collections](/docs/guides/features/collection-move/).
