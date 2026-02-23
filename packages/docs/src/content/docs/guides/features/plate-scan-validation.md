---
title: Validate Plate Scan
description: Compare a scanned plate CSV to the database
---

Validate plate scan lets you upload a CSV file from a plate scanner and compare it to a micronix plate in the database. You can confirm that the physical scan matches what SampleDB expects: which wells have tubes, which barcodes are in which positions, and whether any containers are marked exhausted or have tags.

The feature is available under **Operations → Validate plate scan** in the sidebar. It uses the same "modern precision lab" theme as other storage and container pages.

## When to use it

Use validate plate scan when you want to:

- Check that a scanned plate CSV matches the plate record in the database.
- Find wells that are missing from the scan (expected in DB but not scanned or scanned empty).
- Find wells that appear in the scan but are not in the database (extra in scan).
- Spot barcode mismatches (same position, different barcode in scan vs DB).
- See which wells are exhausted (remaining quantity zero) or have tags.

Validation is read-only: it does not change any data.

## Upload and configure

1. **Scanner configuration**  
   Choose the scanner configuration that matches your CSV format (column names for barcode and position, row/column vs single position column, and how many header rows to skip). The same configurations used for container move and qPCR plate upload are available. You can manage them in **Settings → Scanner configurations**.

2. **CSV file**  
   Upload the scanned plate CSV. The file should have a barcode column and a position column (or separate row and column columns), as defined by the selected scanner configuration.

3. **Plate**  
   Choose how to identify the plate:
   - **I know the plate**: Select the micronix plate in the database to compare against. If the filename (without `.csv`) looks like a plate name, the system suggests one or more matching plates. Filenames often include dates or times (e.g. `PLATE1_2024-01-15.csv`); the system strips common date/time suffixes and uses the remaining stem to suggest plates. You can confirm the suggested plate or pick another from the list.
   - **Infer plate from scan**: Use this when you do not know the plate name. The system infers the plate from the barcodes in the scan: all scanned tubes must belong to the same plate in the database. When inference succeeds, the result shows the inferred plate name and the same comparison (match/mismatch/missing/extra) as when you select a plate. When the system **cannot** infer a single plate—for example the scan has no barcodes (you get an error message), or it has unknown barcodes (not in the database), or tubes from more than one plate—you see a **detailed inference report** instead of a single error. The report lists unknown barcodes (if any) and a per-plate breakdown: for each plate that appears in the scan, how many tubes are from that plate and how many of those are in their expected position on that plate. You can download this report as CSV.

4. **Validate**  
   Click **Validate scan**. The app sends the CSV (and plate ID if you selected one) to the server and displays the comparison result.

## Reading the result

The result shows:

- **Summary counts**: Matched wells, mismatch (same position, different barcode), missing in scan (in DB but not in scan or scanned empty), and extra in scan (in scan but not in DB). If any wells are exhausted or have tags, those counts are shown as well.
- **Overall status**: A short message indicates whether the scan matches the database or there are discrepancies.
- **Well table**: Each row is a well (position). Columns show:
  - **Position** (e.g. A01)
  - **Scanned** barcode from the CSV (or — if empty)
  - **Expected** barcode from the database (or — for static wells)
  - **Scanned barcode from**: For mismatch or extra-in-scan, where that scanned barcode is registered in the database (plate name and position). Helps you see if a tube was misplaced from another plate. Shows — when the barcode is not in the database.
  - **Status**: Match (green), Mismatch (red), Missing in scan (amber), Extra in scan (blue)
  - **Notes**: Badges for "Exhausted" and any tag names on the container

Use the table to track down specific wells that don’t match or are missing so you can correct the physical plate or the database as needed.

## When inference cannot determine a single plate

If you use **Infer plate from scan** and the scan contains unknown barcodes (not in the database) and/or tubes from more than one plate, the app shows an **Inference report** instead of a validation result. The report includes:

- **Unknown barcodes**: Count and list of barcodes in the scan that are not in the database. Use this to add missing tubes or correct typos.
- **Plate breakdown**: A table with one row per plate that appears in the scan. For each plate you see how many tubes from that plate are on the scan and how many of those are in their expected well position (i.e. scanned at the position where that tube is registered on that plate). This helps you see whether the scan might be a mix of plates or tubes in the wrong wells.

You can download the inference report as CSV from the same page.

## Filename matching

Plate suggestion from the filename works best when the filename starts with or contains the plate name. The system:

- Removes the `.csv` extension.
- Strips common date/time suffixes (e.g. `_2024-01-15`, `_20240115`, `_143000`).
- Uses the remaining stem to find plates by exact name (case-insensitive), or by "contains" (plate name contains stem, or stem contains plate name).

If one plate matches, it is auto-selected. If multiple match, you choose from the list. If none match, you can still pick any plate manually.

## Related workflows

- **Container move (micronix)** uses the same CSV format and scanner configurations to move tubes to a destination plate; it does not perform validation.
- **qPCR experiments** use a similar plate CSV upload for plate layout; validate plate scan is independent and does not create or change experiments.
