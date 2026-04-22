# qPCR Plate Scan Example CSV

**File:** `qpcr-plate-scan-example.csv`

This CSV represents a scanned 96-well micronix plate for use in the qPCR experiment workflow. It was generated from the production database using:

```bash
./scripts/generate_qpcr_plate_csv.sh /path/to/sampledb_database.sqlite
```

## Format

- **Columns:** `Row`, `Column`, `Barcode`
- **Scanner config:** Use **General** when uploading in the qPCR experiment (Row, Column, Barcode).
- **Layout:**
  - **A01–A06:** Standard curve controls (10k, 1k, 100, 10, 1, neg). Filled only if the database has control specimens stored in micronix tubes; otherwise empty.
  - **A07–H12:** Study subject micronix tube barcodes (real barcodes from the DB), then empty wells.

## Regenerating

To regenerate from your own database (e.g. production):

```bash
# Default: uses DATABASE_PATH or repo root sampledb_database.sqlite
./scripts/generate_qpcr_plate_csv.sh

# Explicit path
./scripts/generate_qpcr_plate_csv.sh /path/to/sampledb_database.sqlite

# Custom output path (second argument)
./scripts/generate_qpcr_plate_csv.sh /path/to/db.sqlite /path/to/output.csv
```

If your database has blood control specimens in **micronix tubes** (with control definition `targetDensity` 10000, 1000, 100, 10, 1, and 0 for negative), the script will place one barcode per standard level in wells A01–A06.
