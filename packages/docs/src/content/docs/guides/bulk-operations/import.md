---
title: Bulk Import
description: Import subjects and specimens in bulk using CSV files
---

Bulk import is one of the most powerful features in SampleDB, allowing you to add multiple subjects and specimens at once using CSV (Comma-Separated Values) files. Instead of entering data one item at a time, you can prepare a spreadsheet with all your data and import everything in a single operation. This is especially valuable when you're setting up a new study with many subjects, migrating data from another system, or adding large batches of samples that were collected together.

The import process is designed to be safe and informative. The system validates your data before importing anything, shows you exactly what will be created, and provides clear error messages if something needs to be fixed. This validation step prevents problems and helps ensure your data is imported correctly the first time.

## Understanding Import Types

SampleDB supports three different import types, each designed for different scenarios. Choosing the right type for your situation makes the import process smoother and ensures your data is organized correctly.

**Subjects Only** import is the simplest option. It creates subjects for existing studies without adding any specimens. This is useful when you want to set up your subject list first, perhaps to verify enrollment or prepare for specimen collection. The CSV file needs just two columns: the study short code and the subject name. This import type assumes the studies already exist in your system, so make sure your study codes are correct before importing.

**Specimens Only** import adds specimens to subjects that already exist in the system. This is useful when you've already created subjects (either individually or through a previous import) and now want to add their specimens. You can optionally select a container type (e.g. Micronix tubes); when you do, the same container columns are required as for Combined import (e.g. `position` for micronix/cryovial/static wells; `bag_name`, `sheet_name`, and optional `sublabel` for papers). The system requires that subjects exist before you can add specimens to them, so this import type will fail if it encounters subject names that don't exist. This is actually a safety feature—it prevents accidentally creating duplicate subjects with slightly different names.

**Combined import** (Subjects with Specimens) is the most flexible option and is often the best choice for new data. It creates both subjects and their specimens in one operation, and it automatically creates subjects if they don't already exist. This means you don't need to worry about whether subjects are already in the system—the import handles it for you. This is perfect for importing data from external sources, setting up new studies, or any situation where you're not sure about the current state of your subjects.

### Bulk import from a study page

If you are on a study detail page, you can open **Bulk import** from the "More actions" menu. The flow is the same (Subjects only, Specimens only, or Combined; same validation and collection steps), but **you do not need a `study_short_code` column** in your CSV—the study is already set from the page you're on. For **Subjects only**, your CSV needs only `subject_name`. For **Specimens only** or **Combined**, you need `subject_name`, `specimen_type_name`, and any container columns as described below. All other CSV requirements (specimen type names, dates, positions, plate/box/bag names, etc.) are the same. Templates downloaded from the study import page omit the study column.

## The Import Process

The import process is broken into three clear steps that guide you through the entire operation. The system shows you progress through these steps and won't let you proceed until each step is completed successfully.

### Step 1: Upload and Validate Your Data

The first step is preparing and uploading your CSV file. Start by navigating to the Import section in the sidebar. You'll see options to select your import type and, if you're importing specimens, your container type.

When selecting your import type, think about your data. If you only have subject names and study codes, choose "Subjects Only". If you have specimens but the subjects are already in the system, choose "Specimens Only". If you have both subjects and specimens together, or if you're not sure whether subjects exist, choose "Combined"—it's the most forgiving option.

If you're importing specimens, you'll also need to select a container type. This tells the system what kind of containers to create for your specimens. You can choose "No Containers" if you just want to register specimens without creating containers, or select a specific container type: Micronix Tubes, Cryovial Tubes, Papers, or Static Wells. It's important to note that all specimens in a single import must use the same container type. If you have specimens that need different container types, you'll need to run separate imports for each type.

For **Combined** import, you can choose **Atomicity**: **Full file (all-or-nothing)** or **Per subject**. Full file runs the entire import in one transaction (including creating missing collections if you assign locations); per subject commits each subject separately so some can succeed while others fail.

Once you've selected your import type and container type, the system will show you what columns are required in your CSV file. This is helpful because it tells you exactly what information you need to provide. Before creating your CSV file, consider downloading a template. The template includes the correct column headers and example rows showing the expected format, which makes it much easier to prepare your data correctly.

When you're ready, click "Choose File" or drag and drop your CSV file into the upload area. The system will immediately preview the first five rows of your file, which lets you verify that the columns are being read correctly. Required columns are highlighted, making it easy to see what's needed. Review this preview carefully—if the columns don't look right, there might be an issue with your CSV formatting.

Once your file is uploaded, click "Validate & Continue" to have the system check your data. The validation process runs in two stages:

1. **Client-side (CSV structure)**  
   The system checks that all required columns are present, validates data formats (dates, positions), checks for missing required values, and identifies any collections that are referenced but don't exist yet. If this finds problems, you see errors immediately and can fix your CSV before continuing.

2. **Server-side (before import)**  
   When you proceed to the import step (or when missing collections have been created), the server runs a full validation pass **before** writing anything. It checks study and subject names, specimen types, collection dates, container types and units, that collections exist or have a location to be created, that locations can hold collections, and that barcodes and positions are unique (both in the database and within your file). If any of these checks fail, **no data is imported**. You see all validation errors at once (with row numbers where applicable), and you must fix your file or collections and run Validate & Continue again before the import will run.

If validation finds any problems, you'll see clear error messages explaining what needs to be fixed. The errors are specific—they'll tell you which row has the problem and what the issue is. Common problems include missing columns, incorrect date formats, invalid position formats, study codes that don't exist, duplicate barcodes or positions, or locations that cannot contain collections. Fix these issues in your CSV file (or in the collections step) and run validation again.

### Step 2: Creating Missing Collections

If your CSV file references collections (plates, boxes, or bags) that don't exist in the system yet, you'll see a step where you can create them. This step only appears if collections are needed, so if you're importing subjects only or specimens without containers, you'll skip directly to the import step.

The system shows you a list of all the missing collections it found in your CSV file. For each collection, you'll need to specify where it's stored by choosing a location using the hierarchical location tree (the same picker used when moving collections or configuring new collections). Only locations that can contain collections are shown and selectable; the API also rejects creating collections in locations that cannot hold collections, so invalid choices are blocked in both the UI and the server.

For plates and boxes, you can optionally enter a barcode if the collection has one. This is helpful for tracking and makes it easier to find collections later using barcode scanners.

Once you've assigned locations to all the missing collections:

- If you chose **Per subject** atomicity, click **Create Collections & Continue**. The system creates the collections, then the import runs (each subject in its own transaction).
- If you chose **Full file (all-or-nothing)** atomicity, click **Import (creates collections in same transaction)**. The system creates the missing collections and all subjects, specimens, and containers in a single transaction, so either everything succeeds or nothing is committed.

### Step 3: Importing Your Data

Once validation passes and collections are created (if needed), the import step runs a final server validation. If that passes, the import runs automatically. If validation fails (e.g. a barcode already exists, or a position is already used in a plate), you see all errors on the import step with row numbers; no data is written. Use "Back to Upload" to fix your CSV and run Validate & Continue again.

When the import runs, the system processes each row in your CSV file, creating subjects (if needed), creating specimens, creating containers (if specified), and linking everything together correctly.

When a specimen with the same study, subject, specimen type, and collection date already exists, the import reuses that specimen and only adds containers when container data is provided. No duplicate specimen rows are created; the summary reflects how many specimens were newly created versus how many containers were added.

The import process shows you progress, and when it completes, you'll see a summary of what was created. The summary tells you how many items were successfully imported, and if there were any errors, it lists them with specific information about what went wrong and which rows had problems.

### Atomicity and failure behavior

- **Subjects only** and **Specimens only**: Each bulk request is **all-or-nothing**. If validation passes, the entire batch is written in a single database transaction. If anything fails during the write (e.g. a duplicate or constraint error), the whole batch is rolled back and nothing is committed.
- **Combined import**: You can choose the atomicity per run:
  - **Full file (all-or-nothing)**: The entire CSV is imported in one transaction. Missing collections can be created in the same transaction if you assign locations and click **Import (creates collections in same transaction)**. If any row or collection creation fails, nothing is committed.
  - **Per subject**: Each subject (and its specimens and containers) is committed in its own transaction. Some subjects can succeed while others fail; you get a summary and per-subject errors. You create missing collections first with **Create Collections & Continue**, then run the import.
- In **Full file** mode, the server performs a final in-transaction consistency check before writes so stale pre-validation (for example, deleted collections or changed mappings) does not result in partial commits.
- **Derivation bulk import** (see [Derivations](/docs/guides/features/derivations/)): All derivations in the CSV are created in one transaction, or none if any row fails.

If a request fails, fix the issues (e.g. in your CSV or missing collections) and try again. For **per subject** combined import, rows that succeeded are already committed; only failed subjects need to be fixed and re-imported if desired.

## Understanding CSV Requirements

The columns required in your CSV file depend on what you're importing and what container type you're using. The system is flexible enough to handle different scenarios, but it needs certain information to create records correctly.

For a Subjects Only import, you need just two columns: `study_short_code` and `subject_name`. The study short code must match an existing study in your system, and subject names must be unique within each study.

For Specimens Only or Combined imports without containers, you need `study_short_code`, `subject_name`, and `specimen_type_name`. You can include an optional `collection_date` column (YYYY-MM-DD); it is not required but is recommended for tracking. The specimen type name must match exactly what's in your Reference Data, including capitalization.

When you're importing specimens with containers, the requirements become more specific. You can include an optional `comment` column; values are stored on each container and are useful for notes (e.g. quality, handling). For Micronix tubes, use `plate_name`, a unique barcode for each tube, and a position in the plate. The position must be in the correct format: a letter (A-H) followed by two digits (01-12), like "A01" or "B12". For Cryovial tubes, use `box_name` and a position. Barcodes are optional for cryovial tubes. For Papers, use `bag_name`, `sheet_name`, and optionally `sublabel` for the spot identifier. For Static Wells, use `plate_name` and a position, using the same A01-H12 format as Micronix tubes. The collection identifier must use the column for your selected container type (`plate_name`, `box_name`, or `bag_name`) so it matches the built-in import templates.

Column headers are treated **case-insensitively**, so "Position" and "position" both satisfy the required `position` column. The column may also be named `well_position` or `well` and will be accepted. If required container data is missing (e.g. well position for micronix tubes), validation will fail with a clear message before any data is imported.

The system provides templates for each scenario, which include the correct column headers and example data showing the expected format. These templates are invaluable for ensuring your CSV file is formatted correctly.

## Common Import Scenarios

Different situations call for different import approaches. If you're setting up a completely new study with subjects and their initial specimens, a Combined import is usually the best choice. You can include all subjects and their specimens in one CSV file, specify the container type if applicable, and import everything in one operation. This creates the complete study structure efficiently.

If you're adding specimens to subjects that already exist—perhaps because you've collected follow-up samples or additional specimen types—a Specimens Only import works well. Make sure your subject names match exactly what's in the system, and the import will add the new specimens to the existing subjects.

For subjects with multiple collection dates (in longitudinal studies), you simply include multiple rows in your CSV file, one for each collection. Each row creates a separate specimen with its own collection date. This allows you to track the complete collection history for each subject over time.

## Position Format Guidelines

Getting position formats right is crucial because incorrect positions make it difficult to locate samples later. For Micronix tubes and Static Wells, positions must use a letter followed by two digits, with the digits zero-padded. "A01" is correct, but "A1" is not. "B12" is correct, but "B012" is not. This format matches standard 96-well plate layouts and ensures compatibility with laboratory equipment and other software.

For Cryovial tubes, the position format depends on your box layout. Some boxes use letter-number combinations like "A5" or "B12", while others use just numbers like "1" or "25". The system accepts whatever format matches your boxes, but consistency within each box is important so positions are meaningful.

## Troubleshooting Import Issues

If your import encounters problems, the error messages are designed to help you fix them quickly. Validation runs **before** any data is written, so you can fix issues and try again without partial imports.

- **Missing required columns**  
  The system will tell you exactly which columns are needed. Add them to your CSV and ensure headers match the expected names (case-insensitive). For the collection identifier, use the type-specific column for your import: `plate_name` (Micronix or static wells), `box_name` (cryovial tubes), or `bag_name` (paper).

- **Invalid study codes / Study not found**  
  The study short code in your CSV does not exist. Create the study first or correct the code.

- **Subject name already exists / Duplicate subject**  
  A subject with that name already exists in the study, or the same subject appears more than once in your file. For Combined import, existing subjects are updated (specimens are added); for Subjects Only, each subject name must be new and unique in the batch.

- **Missing collections**  
  Referenced plates, boxes, or bags are not in the system. Use the "Create Missing Collections" step to assign locations and create them, or fix the names/barcodes in your CSV.

- **Location cannot contain collections**  
  The location you chose for a new collection does not allow collections (only certain location types do). Pick a location that can hold collections (e.g. a freezer or shelf that is configured to contain collections).

- **Position already used / duplicate position**  
  That well or position (e.g. A01) is already used in that plate or box, or the same position appears more than once in your file for the same collection. Each position in a plate or box can only be used once. Use a different position or a different collection.

- **Barcode already exists / duplicate barcode**  
  The barcode is already assigned to another container in the system, or the same barcode appears more than once in your file. Each barcode must be unique. Validation catches these before any import runs, so no data is written. Use a different barcode or remove the duplicate row.

- **Position format errors**  
  For Micronix and Static Wells, use the "A01" format (letter + two digits). For Cryovial tubes, use a format that matches your box layout and is consistent within the file.

- **Invalid specimen type**  
  The specimen type name in your CSV doesn't match Reference Data. Check spelling and capitalization—specimen type names are case-sensitive.

## Best Practices for Successful Imports

A few simple practices can make your imports go smoothly. Always test with a small file first—import just a few rows to verify the format is correct before importing hundreds or thousands of rows. Use the provided templates to ensure your column names and formats are correct. Validate before importing large files—the validation step catches problems early and saves time.

Check your study codes before importing to make sure they exist in the system. Use consistent naming for subjects and collections so your data is organized clearly. And keep backups of your CSV files—having the original files makes it easy to re-import if needed or to track what was imported when.

## What's Next?

Now that you understand bulk import, you might want to explore [Bulk Export](/docs/guides/bulk-operations/export/) to learn how to export your data, review the [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/) for detailed formatting requirements, or check [Common Issues](/docs/guides/troubleshooting/common-issues/) if you encounter problems during import.
