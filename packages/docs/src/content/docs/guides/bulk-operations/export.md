---
title: Multi-study export
description: Export containers for a list of subjects across studies
---

**Operations → Export → Multi-Study Export** finds containers for the subjects in a CSV and downloads them. The page heading is **Export Containers (Multi-Study)**.

## Subject-list CSV

Required columns: `study_short_code` and `subject_name`.

Optional:

- `collection_date`: only containers from specimens collected on that date, plus date tolerance.
- `date_from` and `date_to`: a per-subject date range.

With only study and subject columns, the export includes all containers for those subjects unless you apply filters on the page.

## Run an export

1. Open **Operations → Export → Multi-Study Export**.
2. Under **Upload CSV File**, select the subject list. SampleDB parses the file and shows how many rows it read.
3. Study codes are checked immediately. Valid studies show title and lead person. Invalid codes are listed and must be fixed before you can export.
4. Optional: set date tolerance in days. Default is zero (exact match). With two days, `collection_date` `2024-01-15` matches January 13 through 17. Tolerance applies only to subjects that have a date in the CSV. Subjects without a date export all of their containers, aside from other filters.
5. Optional: apply filters. A container must match every selected filter. The matching container count updates as you change filters.
6. Choose an export configuration (column set) and a download format.
7. Click **Export**. The file downloads when processing finishes.

## Filters

Leave a filter unchecked to include all values of that kind.

- **Specimen Types.** One or more types.
- **Container Types.** Micronix Tube, Cryovial Tube, Paper, Static Well. Unchecked means all types.
- **Collection Date Range.** Applies to subjects with no dates in the CSV. A row with `collection_date` or `date_from`/`date_to` ignores this range.
- **Created Date Range.** When the container was created in SampleDB, not collection date.
- **Tags.** Containers that have **all** selected tags (same AND rule as Statistics).

You can clear all filters without re-uploading the CSV.

## Formats and configurations

**CSV download** is the default. Plain quoted values, no Excel formula wrappers. If Excel strips leading zeros, use XLSX.

**XLSX download** marks identifier and code columns as text cells so leading zeros and long barcodes survive in Excel.

**JSON download** is for programmatic import.

On this page, the study export modal, and barcode export, you can override CSV delimiter, UTF-8 BOM, and line ending. Defaults (comma, BOM on, CRLF) match [CSV file guidelines](/docs/guides/troubleshooting/csv-guidelines/).

Older container export CSVs wrapped some columns as `="..."`. Current files use plain strings. See [Release notes](/docs/guides/troubleshooting/release-notes/) if you update scripts.

Column presets are **Export Configurations** in [Application Settings](/docs/guides/advanced/settings/) under **Data Management → Export Configurations**. For paper containers, use `sublabel` and `sheet_name`, not `barcode`, for spot identifiers.

Collection **Table** views use **Table View Configurations** (administrators create presets; lab staff pick them from **Columns**). **Export CSV** on a collection table is a snapshot of the rows on screen. It does not use export configurations and does not offer XLSX or JSON.

## Results summary

The summary lists total containers, then per study: code, title, lead person, and container count.

- **Subjects with Results.** Subjects that contributed containers, with counts.
- **No Results.** Subjects that exist but had no matching containers.
- **Not Found.** Names in the CSV that do not match a subject in the study.

Invalid study codes are listed separately.

## Empty or incomplete exports

Check the summary first. If every subject is **No Results**, filters or dates may be excluding everything. If some names are **Not Found**, fix spelling. Invalid study codes block the export until you correct the CSV and upload again.
