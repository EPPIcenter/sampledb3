---
title: Conventions
description: Naming and data-entry rules that SampleDB enforces
---

These are constraints in the product, not optional style.

## Studies

- **Short code** must be unique. It appears in CSV import and export. Avoid characters that break CSV quoting.
- **Longitudinal study** cannot be changed after create. If subjects need more than one collection date, select it now. If you are unsure, select it.
- A study whose short code starts with **TUT** can be deleted by any user. The create form warns if you use that prefix on a real study.

## Subjects and specimens

- Subject names are unique **within a study**.
- Specimen type names in import and forms must match **Reference Data** exactly, including capitalization.
- Collection dates use `YYYY-MM-DD`. The registration form does not default to today if you leave the date blank.
- Specimens cannot be edited in the app after create.

## Containers

- Micronix barcodes are unique across the system.
- Micronix and static-well positions store as `A01`. `A1` is padded.
- Paper uses **sheet name** and optional **spot label** (`sublabel` in CSV), not tube barcodes.
- Status is **In Use** when remaining quantity is greater than zero, **Exhausted** at zero.

## Locations

- Only administrators create and edit locations.
- Only locations that can contain collections appear when you assign a plate, box, or bag.
- You cannot delete a location that still has children or collections.

## Import and export

- Import validates before write. Fix errors and run **Validate & Continue** again.
- Combined import atomicity: **Full file** is all-or-nothing; **Per subject** commits each subject separately.
- There is no undo after a container or collection move.

For CSV columns and download conventions, see [CSV file guidelines](/docs/guides/troubleshooting/csv-guidelines/).
