---
title: Bulk import
description: Import subjects and specimens from CSV files
---

Use **Operations → Import** to create many subjects and specimens from a CSV file. SampleDB validates the file before it writes anything. If validation fails, nothing is imported.

You can also open **Bulk import** from **More actions** on a study detail page. That flow is the same, except the CSV does not need a `study_short_code` column. Templates downloaded from the study page omit that column.

## Import types

**Subjects Only.** Creates subjects in studies that already exist. Required columns: `study_short_code` and `subject_name`. Subject names must be unique within each study.

**Specimens Only.** Adds specimens to subjects that already exist. You must select a **Container Type**. Choose **No Containers** to register specimens without creating containers. If a subject name is missing, that row fails so you do not create a near-duplicate subject.

**Subjects with Specimens (Combined).** Creates subjects that do not exist, then their specimens. Use this when you are loading a new study or you are not sure which subjects are already in the system.

One file can hold samples from several studies, for example a plate shared by three studies. Each row goes into the study in its own `study_short_code` column. A subject name that appears under two study codes becomes two separate subjects, one in each study.

For **Specimens Only** or **Combined** with a container type, the same container columns are required: `position` for micronix, cryovial, and static wells; for papers, exactly one of `box_name` or `bag_name`, plus `sheet_name`.

### Import from a study page

On a study detail page, **Bulk import** already knows the study. For **Subjects only**, the CSV needs only `subject_name`. For **Specimens only** or **Combined**, include `subject_name`, `specimen_type_name`, and any container columns described later on this page.

## Run an import

1. Open **Operations → Import**.
2. Select the import type. If you are importing specimens, select a **Container Type**. The file upload appears only after you choose a container type. Every row in one import must use the same container type; run separate imports for mixed types.
3. For **Combined**, choose **Atomicity**: **Full file (all-or-nothing)** or **Per subject**.
4. Optional: click **Download Template** for headers and example rows that match the current type.
5. Under **CSV File**, select the file. SampleDB shows a preview of the first rows. Required columns are highlighted. If the preview looks wrong, fix the CSV and select the file again.
6. Click **Validate & Continue**.

Validation has two stages:

1. **Parsing and collection lookup.** The browser maps columns, then asks the server which collections in the file do not exist yet. Row-level rules are not decided in the browser.
2. **Server validation.** Before any write, the server checks study and subject names, specimen types, collection dates, container types and units, that collections exist or have a location so they can be created, that locations can hold collections, and that barcodes and positions are unique in the database and in the file. You see every error at once, with row numbers where applicable. Fix the CSV or collections, then click **Validate & Continue** again.

Common failures include missing columns, wrong date or position format, unknown study codes, duplicate barcodes or positions, and locations that cannot hold collections.

## Create missing collections

This step appears only if the CSV names plates, boxes, or bags that are not in the system. For each missing collection, pick a location in the hierarchical tree. Only locations that can hold collections are selectable. For plates and boxes, you can enter an optional barcode.

- **Per subject:** click **Create Collections & Continue**. Collections are created, then each subject is imported in its own transaction.
- **Full file (all-or-nothing):** click **Continue to Import**. Missing collections, subjects, specimens, and containers are created in one transaction. Either everything is committed or nothing is.

If you are importing subjects only, or specimens with **No Containers**, you skip this step.

## Import results

After collections are created if needed, the server validates again. If that pass fails, you see all errors on the import step and nothing is written. Click **Back to Upload**, fix the CSV, and run **Validate & Continue** again.

When a specimen with the same study, subject, specimen type, and collection date already exists, the import reuses that specimen and only adds containers when container data is present. The summary shows how many specimens were created versus how many containers were added.

## Atomicity

- **Subjects only** and **Specimens only:** the whole batch is one transaction. If anything fails after validation, the batch is rolled back.
- **Combined, Full file (all-or-nothing):** the entire CSV is one transaction, including missing collections if you assigned locations and clicked **Continue to Import**. The server runs a final in-transaction check so stale pre-validation cannot produce a partial commit.
- **Combined, Per subject:** each subject, with its specimens and containers, is committed separately. Some subjects can succeed while others fail. Create missing collections first with **Create Collections & Continue**.
- **Derivation bulk import:** all rows succeed together or none do. See [Derivations](/docs/guides/features/derivations/).

If a **per subject** run partly succeeds, only failed subjects need to be fixed and re-imported.

## CSV columns

Column headers are case-insensitive. `Position`, `position`, `well_position`, and `well` all satisfy `position`. Specimen type names are case-sensitive and must match **Reference Data** exactly.

**Subjects Only:** `study_short_code`, `subject_name`.

**Specimens Only or Combined, no containers:** `study_short_code`, `subject_name`, `specimen_type_name`. Optional `collection_date` as YYYY-MM-DD.

**With containers:** the same columns, plus container fields for the selected type. Optional `comment` is stored on each container. Collection identifier must use the column for that type (`plate_name`, `box_name`, or `bag_name`) so it matches the templates.

- Micronix: `plate_name`, unique barcode, `position` (letter A-H plus two digits, for example `A01`).
- Cryovial: `box_name`, `position`. Barcode is optional.
- Paper: exactly one of `box_name` or `bag_name`, plus `sheet_name`. Optional `sublabel` for the spot.
- Static wells: `plate_name` and `position`, same A01-H12 format as micronix.

## Position format

For micronix and static wells, the stored form is a letter plus two zero-padded digits: `A01`. `A1` and `a1` are accepted and padded to `A01`. `B012` is not valid.

For cryovial tubes, match the box layout. Letter-number (`A5`) and numbered (`25`) positions are both accepted. Keep the format consistent within a box.

## Multiple collection dates

In a longitudinal study, use one CSV row per collection. Each row creates a separate specimen with its own collection date.

## Errors

- **Missing required columns.** Add the columns named in the error. For the collection identifier, use `plate_name` for micronix or static wells, `box_name` for cryovial tubes, or exactly one of `box_name` or `bag_name` for paper.
- **Invalid study codes / Study not found.** Create the study first, or correct the code.
- **Subject name already exists / Duplicate subject.** For Combined, existing subjects get new specimens. For Subjects Only, each name must be new in the study and unique in the batch.
- **Missing collections.** Assign locations on **Create Missing Collections**, or fix names and barcodes in the CSV.
- **Location cannot contain collections.** Pick a location that is allowed to hold collections, such as a freezer or shelf configured for that.
- **Position already used / duplicate position.** That well is taken in the plate or box, or the same position appears twice in the file for the same collection.
- **Barcode already exists / duplicate barcode.** The barcode is already in the database or appears twice in the file.
- **Position format errors.** Use `A01` for micronix and static wells. Match the box layout for cryovial tubes.
- **Invalid specimen type.** The name does not match Reference Data. Spelling and capitalization must match.

For column rules and date formats, see [CSV file guidelines](/docs/guides/troubleshooting/csv-guidelines/).
