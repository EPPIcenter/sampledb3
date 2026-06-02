---
title: CSV File Guidelines
description: Detailed guidelines for preparing CSV files for import
---

Proper CSV file formatting is essential for successful imports. This guide provides detailed requirements and best practices for CSV files, helping you prepare data that imports correctly the first time. Understanding these requirements prevents common errors and makes the import process smooth and efficient.

## Understanding CSV File Basics

CSV (Comma-Separated Values) files are text files that store data in a simple format. The file extension should be `.csv`, and UTF-8 encoding is recommended to ensure special characters are handled correctly. The delimiter is a comma (`,`), and text qualifiers (double quotes `"`) should be used for values containing commas to prevent parsing errors.

The file structure is simple: the first row contains column names (the header row), and subsequent rows contain data. There should be no empty rows between data rows, as these can cause parsing issues. Each row should have the same number of columns as the header row.

## Column Requirements

Column names must match exactly what the system expects—they're case-sensitive, so "study_short_code" is different from "Study_Short_Code". Remove any leading or trailing spaces from column names, as extra spaces cause matching failures. Use standard column names from the templates provided by the system, as these are guaranteed to work correctly.

Required columns must be present and have values in every row. Optional columns can be omitted entirely or left empty, but if you include them, they should follow the same formatting rules as required columns. Templates show which columns are required and which are optional, making it easy to prepare your file correctly.

## Date Format Requirements

Collection dates must use the `YYYY-MM-DD` format consistently. This means four-digit years, two-digit months (zero-padded), and two-digit days (zero-padded). For example, `2024-01-15` is correct, but `01/15/2024`, `15-01-2024`, or `2024-1-5` are not.

Always use the YYYY-MM-DD format, zero-pad months and days (use "01" not "1"), and use four-digit years. This format is international standard and prevents ambiguity about which number is the month versus the day.

For date ranges in exports, both `date_from` and `date_to` use the same YYYY-MM-DD format as collection dates. Consistency in date formatting prevents parsing errors and ensures dates are interpreted correctly.

## SampleDB export CSV conventions

SampleDB **CSV download** files — **Container export**, **Specimen export**, **Inventory export**, **Collection table snapshot export**, and import templates — share a common wire format so files behave predictably in Excel, R, and Python.

**Plain cell values (RFC 4180)**

- Values are plain strings, numbers, or dates in cells — not Excel formula wrappers.
- SampleDB does **not** emit `="001234"`-style formula cells in export CSV. Identifier columns such as barcodes appear as quoted strings when needed, for example `"001234"`.
- If you need Excel to treat barcodes and IDs as text with leading zeros preserved, use **XLSX download** from **Container export** workflows (Bulk export, Study export modal, Barcode export).

**Default wire settings**

- UTF-8 encoding with BOM (helps Excel detect encoding)
- CRLF line endings
- Comma delimiter

**Container export overrides**

On the Export page, Study export modal, and Barcode export, you can change delimiter, BOM, and line ending before download. **Specimen export**, **Inventory export**, and **Collection table snapshot export** use the canonical defaults.

**Bulk export vs collection table snapshot**

- **Bulk export** (Export page) and other **Container export** entry points produce server-side exports using **Export configuration** columns and optional XLSX/JSON formats.
- **Collection table snapshot export** on a plate, box, bag, or sheet detail page exports the current table view client-side using **Table view configuration** columns — not export configurations.

See [Release Notes](/docs/guides/troubleshooting/release-notes/) for the breaking change that removed Excel formula wrappers from container export CSV.

## Position Format Requirements

Position formats vary by container type, and getting them right is crucial for successful imports.

### Micronix and Static Well Positions

For Micronix tubes and Static Wells, positions must use a letter followed by two digits, with the digits zero-padded. The format is "A01" through "H12" for 96-well plates. "A01" is correct, but "A1" (missing zero), "A 01" (has space), "a01" (lowercase), or "A001" (too many digits) are not.

Valid positions follow the pattern: letter (A-H) + two digits (01-12). Always use uppercase letters and zero-pad the digits. This format matches standard 96-well plate layouts and ensures compatibility with laboratory equipment.

### Cryovial Positions

Cryovial positions depend on your box layout, so the format varies. Some boxes use letter-number combinations like "A5" or "B12", while others use just numbers like "1" or "25". Whatever format you use, match your box layout exactly and be consistent within each box. Document your position format so team members can follow it.

## Barcode Format Guidelines

Barcodes should be alphanumeric (letters and numbers), with no spaces. Be consistent with case, as barcodes are case-sensitive. Most importantly, each barcode must be unique across your entire system.

### Micronix Tube Barcodes

Micronix tube barcodes are required and must be unique. Common formats include "MTX-12345", "M001234", or "MTX001234". Use a consistent format, include a prefix if helpful for identification, and ensure uniqueness. Document your format so team members can follow it.

### Collection Barcodes

Collection barcodes are optional but can be very helpful. Formats might include "PLATE-BC-001", "BOX-12345", or "PLATE001". Use consistent formats, distinguish collection barcodes from container barcodes if helpful, and document your format.

## Text Value Requirements

Different text values have different requirements that must be followed for successful imports.

### Study Short Codes

Study short codes should be alphanumeric, typically uppercase, and 3-6 characters long. Examples include "NAM15", "TCC08", or "PILOT1". They must match existing studies exactly, including case.

### Subject Names

Subject names should be alphanumeric with hyphens or underscores allowed. Examples include "SUBJ-001", "P001", or "S_001". Avoid most special characters, as they can cause issues in CSV files and exports.

### Specimen Type Names

Specimen type names must exist in your Reference Data and match exactly, including case. "Whole Blood" is different from "whole blood". Check your Reference Data to ensure names match before importing.

### Collection Names

Collection names should be alphanumeric with hyphens or underscores. Examples include "PLATE-001" or "BOX-001". Use descriptive names that help identify collections, and be consistent with your naming conventions.

## Units

CSV templates do **not** include a unit column. The system uses the **default unit for that container or specimen type**, configured in Settings (Container Defaults). You do not need to type unit symbols (e.g. µL, spots) in your CSV. Where a flow provides a preview or configuration step (e.g. control batch wizard, bulk derivations), you can adjust quantity and unit in the interface before submitting if needed.

## Common CSV Errors and Solutions

Understanding common errors helps you avoid them and fix them quickly when they occur.

### Missing Required Columns

If you see an error about missing required columns, add the missing columns to your header row. Ensure column names match exactly (case-sensitive), and check the template to see which columns are required for your import type.

### Invalid Date Format

Date format errors mean dates aren't in YYYY-MM-DD format. Use the correct format, zero-pad months and days, and check for typos. Spreadsheet software sometimes changes date formats, so verify dates are actually text in the correct format, not date values that will be reformatted.

### Invalid Position Format

Position format errors usually mean positions don't match the required format. For Micronix tubes, use "A01" format with two-digit columns. For Cryovial tubes, match your box layout. Check for spaces, typos, or incorrect formats.

### Empty Required Fields

If required fields are empty, fill in all required fields for every row. Check for empty cells in required columns, and remove rows with missing required data if you can't fill them in.

### Duplicate Values

Duplicate barcodes or identifiers cause errors because these must be unique. Ensure all barcodes are unique across your entire file and system. Check for duplicate rows that might have been accidentally included, and remove or fix duplicates.

## CSV File Preparation Checklist

Before importing, verify your file meets all requirements. Check that the file is saved as `.csv` format (not .xlsx or .txt). Use UTF-8 encoding if possible. Ensure the header row has correct column names that match exactly. Verify all required columns are present. Remove empty rows between data. Format dates as YYYY-MM-DD. Use correct position formats for your container types. Ensure barcodes are unique. Avoid special characters that cause issues. Verify text values match reference data exactly. Test that the file opens correctly in spreadsheet software.

## Testing Your CSV Before Import

Testing with a small file first saves time and prevents problems. Import just 2-3 rows to verify the format is correct, then check that imported data looks right. Fix any issues you find, then import the complete file once you're confident the format is correct.

Before importing, open the file in spreadsheet software to verify it opens correctly. Check that column names match the template. Review a few sample rows to ensure data looks correct. Use the system's validation feature before importing to catch problems early.

## Where Template Values Come From

Downloaded CSV templates (control batch, derivations, etc.) are generated from your current database and settings. Templates do not include a unit column; the system uses the default unit for the container type (Settings → Container Defaults). **Specimen type names** in examples come from your **Reference Data** (specimen types and their allowed container types). **Position** examples use the normalized format (e.g. A01, B02) expected by the system. Using a fresh template ensures column names and example values match what your system expects.

## Getting Help with CSV Issues

If you're having CSV issues, start by downloading a fresh template from the system to ensure you have the correct format. Compare your file with the template to identify differences. Check error messages carefully—they indicate specific problems that need to be fixed. Review this guide for relevant sections that address your specific issue. If problems persist, contact support with details about the errors you're seeing.

## What's Next?

Now that you understand CSV file requirements, you might want to explore [Bulk Import](/docs/guides/bulk-operations/import/) to learn about the import process, check [Common Issues](/docs/guides/troubleshooting/common-issues/) for troubleshooting help, or review [Best Practices](/docs/guides/troubleshooting/best-practices/) for recommended workflows.
