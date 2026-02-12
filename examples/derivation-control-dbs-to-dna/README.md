# Derivation from Controls: DBS to DNA in Micronix Tubes

Example CSV for **Bulk Derivation Import**: parent = control batch specimens (dried blood spots on paper), child = extracted DNA in micronix tubes.

## Generating the CSV

From the repo root, with your production database (e.g. `sampledb_database.sqlite`):

```bash
./scripts/generate_derivation_control_dbs_to_dna_example.sh [path-to-database]
```

- **Default DB path:** `./sampledb_database.sqlite` (or `sampledb_database.sqlite` in the repo root).
- **Output:** `derivation-dbs-to-dna.csv` in this folder (`examples/derivation-control-dbs-to-dna/`).
- **Requirements:** At least one control batch with DBS (or Dried blood) specimens in **paper** containers. The script selects up to 6 such specimens and assigns 10-digit micronix barcodes that do not already exist in the database.

If no control DBS (paper) specimens exist, the script exits with a message and does not overwrite the CSV. For real data, run the script against your database. A committed sample CSV with placeholder names is also provided for reference.

## Using the CSV in the App

1. Go to **Derivations** → **Import** (or **Bulk Derivation Import** from the command palette).
2. **Step 1 – Settings:**
   - **Source type:** Control batch  
   - **Parent container type:** Paper  
   - **Derivation type:** e.g. DNA Extraction  
   - **Derived specimen type:** e.g. DNA (DBS) — must match a specimen type in Reference Data  
   - **Container type:** Micronix tube  
   - **Protocol** and **Derivation date:** set as needed  
3. **Step 2 – CSV:** Upload `derivation-dbs-to-dna.csv`, then **Validate** and optionally **Dry run**. If validation passes, click **Import** to create the derivations.

**Note:** The column `parent_specimen_type_name` in the CSV is the **parent** specimen type (e.g. DBS on the paper). The **derived** specimen type (e.g. DNA (DBS)) is set in Step 1.

## CSV Format

- **Headers:** `parent_control_batch_name`, `parent_specimen_type_name`, `parent_collection_date`, `plate_name`, `position`, `container_barcode`, `notes`
- **Rows:** One row per derivation — one control DBS (paper) parent → one micronix tube with the given barcode and position. `parent_collection_date` is used to disambiguate when a batch has multiple specimens of the same type.
- **Barcodes:** 10-digit, generated so they do not already exist in `micronix_tube`.

For more on derivations and bulk import, see [Derivations](/guides/features/derivations/) and [Bulk Import](/guides/bulk-operations/import/) in the SampleDB documentation.
