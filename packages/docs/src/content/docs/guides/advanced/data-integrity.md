---
title: Data integrity
description: Audit empty collections and maintain data consistency (admin-only).
---

Data integrity tools help you find and clean up unused or inconsistent data. These features are **admin-only**: only users with the admin role can run audits or delete empty collections.

## Page structure

The Data Integrity area (**Admin → Data Integrity**, or `/admin/data-integrity`) is split into:

- **Overview** (`/admin/data-integrity`): summary counts and links to the two sub-pages.
- **Empty collections** (`/admin/data-integrity/empty-collections`): list of empty plates/boxes/bags with checkboxes and **Delete selected** (the only destructive action).
- **Integrity report** (`/admin/data-integrity/report`): read-only checks in collapsible sections (see below).

From the command palette, run **Go to Data Integrity**, **Data Integrity — Empty Collections**, or **Data Integrity — Report**.

## Integrity report (read-only)

The **Integrity report** sub-page lists rows that failed one or more checks. Each section is collapsible and shows a count. Fixing issues is done outside this page (e.g. via normal app flows or database corrections).

- **Collections with missing location.** Plates, boxes, or bags whose `locationId` no longer exists in `location`.
- **Containers with missing specimen.** Storage containers that reference a deleted specimen.
- **Subtype orphans.** `storage_container` rows with no corresponding row in any of micronix_tube, cryovial_tube, paper, or static_well.
- **Sheets with missing box or bag.** Sheets that reference a deleted box or bag.
- **Specimens with missing subject or batch.** Specimens that reference a deleted study subject or control batch.
- **Study subjects with missing study.** Study subjects that reference a deleted study.
- **Derivation broken references.** container_derivation rows with missing parent or child container.
- **Storage container tag orphans.** Tag links that reference a deleted container or tag.
- **Duplicate barcodes (micronix).** Micronix tubes that share the same barcode (schema expects unique barcodes). Duplicate barcodes on cryovial tubes are **not** treated as a data integrity issue.
- **Location path inconsistencies.** Locations whose stored `path` does not match the path computed from the parent chain.
- **Containers with no grid position.** Tubes or wells in a collection with no well or slot. Legacy rows are allowed and do **not** count toward the overview issue total. Assign a position via edit or scan move when the well is known.

## Empty collections

A **collection** is a container that can hold items: micronix plates, cryovial boxes, boxes, and bags. An **empty collection** is one that has zero items (no tubes, wells, or sheets). Empty collections may be left behind after moves, imports, or deletions.

### Viewing empty collections

1. Go to **Admin** → **Data Integrity** → **Empty collections** (or `/admin/data-integrity/empty-collections`).
2. The table lists all collections that currently have no items.
3. Each row shows type, name, and location path.

### Deleting empty collections

1. In the Empty collections table, select one or more rows with the checkboxes.
2. Click **Delete selected (N)**.
3. Confirm in the modal. Only collections that are **still empty** at the time of the request are deleted.
4. The result shows how many were deleted and, if any could not be deleted, short error messages (e.g. collection no longer empty or not found).

**Caveats:**

- Deletion is **not** cascaded to other data; only the collection row is removed. Because the collection is empty, there are no child records to worry about.
- If a collection gains an item between when you load the page and when you click Delete, that collection will be skipped and reported in the errors list.
- Deleting an already-deleted or invalid ID is reported as an error and does not affect other selected collections.
