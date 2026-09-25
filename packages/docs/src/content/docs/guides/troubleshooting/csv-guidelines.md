---
title: CSV file guidelines
description: File format, dates, positions, and SampleDB download conventions
---

Use a `.csv` file with a header row and no blank rows between data. UTF-8 encoding is recommended. Quote fields that contain commas.

**Download Template** on Import, control-batch CSV, and derivation import builds headers and example values from your database: specimen type names from Reference Data, position examples such as `A01`, and default units from Application Settings. Templates do not include a unit column.

## Import columns

Import column headers are **case-insensitive**. `study_short_code` and `Study_Short_Code` both match. Trim spaces from headers.

Specimen type names, study short codes, and subject names in cell values must match existing records. Specimen type names are **case-sensitive**.

Required columns depend on import type and container type. See [Bulk import](/docs/guides/bulk-operations/import/).

CSV templates do not include a unit column. The default unit comes from **Application Settings → Container Type Units**. Some wizards (control batch, bulk derivations) let you change quantity and unit in the UI before submit.

## Dates

Use `YYYY-MM-DD`: four-digit year, zero-padded month and day. `2024-01-15` is valid. `01/15/2024`, `15-01-2024`, and `2024-1-5` are not.

Export columns `date_from` and `date_to` use the same format. Spreadsheet apps sometimes rewrite dates; confirm the cells are text in this format before import.

## Positions

**Micronix and static wells.** Letter A-H plus two digits 01-12. Stored form is `A01`. `A1` and `a1` are padded to `A01`. Spaces and `A001` are invalid.

**Cryovial.** Match the box: `A5` or `25`. Stay consistent within a box.

## Barcodes and names

Micronix tube barcodes must be unique across the system, alphanumeric, no spaces, case-sensitive. Collection barcodes are optional.

Study short codes are typically 3-6 alphanumeric characters and must match the study exactly. Subject names allow hyphens and underscores. Collection names such as `PLATE-001` should match the type-specific column in the template (`plate_name`, `box_name`, or `bag_name`).

## SampleDB CSV downloads

**CSV download** from container export, specimen export, inventory export, collection table snapshot, and import templates uses:

- Plain RFC 4180 values. No `="001234"` formula wrappers. Identifiers are quoted strings when needed.
- UTF-8 with BOM, CRLF, comma delimiter.

**Container export** (Multi-Study Export, study export modal, Micronix Barcode Export) can override delimiter, BOM, and line ending, and can download **XLSX** (text cells, leading zeros preserved) or **JSON**. Specimen export, inventory export, and collection table snapshot use the defaults and CSV only.

Collection table snapshot uses **Table view configuration** columns. Server container export uses **Export configuration** columns.

See [Release notes](/docs/guides/troubleshooting/release-notes/) for the change that removed Excel formula wrappers.
