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
- **Duplicate tube barcodes.** Micronix and cryovial tubes that share a barcode, comparing without case or surrounding spaces, so `CK3-3FR4` and `ck3-3fr4` count as one barcode. **Spellings** lists each stored form when they differ. Moves and derivations refuse to pick between these tubes, so identify them by container id or position.
- **Duplicate Specimens.** Specimens of one Subject with the same Specimen type and collection date, dated or undated. Registration treats these as one collection event and adds new Containers to the existing Specimen, but legacy data has groups the lab chose to keep. Fresh installs refuse a second dated Specimen; upgraded databases do not.
- **Subject names that differ only by case.** Subjects in one study whose names are the same ignoring case, such as `3d7_10k` and `3D7_10K`. Subject names in a study ignore case, so the app refuses new ones. Merge or rename the Subjects.
- **Collection names that differ only by case or spaces.** Plates, boxes, or bags of one type, or sheets in one box or bag, whose names are the same ignoring case and surrounding spaces. Names are quoted to show the spaces. Rename one, or delete it if it is empty.
- **Containers in a type their Specimen type does not allow.** Containers whose Container type is not one of the allowed Container types of their Specimen type. Allow the type for the Specimen type in Reference data, or correct the Container.
- **Exhausted Containers with remaining quantity.** Containers whose comment says `exhausted` but whose remaining quantity is above 0, so they show as In Use. Set the remaining quantity to 0 if the material is used up.
- **Placeholder collection dates.** Specimens dated `1970-01-01`, `1999-09-09`, `1899-12-30` or `1111-01-01`, dates the old application stored for an unknown date. Clear the date or enter the real one. An upgrade to schema version 13 clears the legacy ones.
- **Collection dates in the future.** Specimens whose collection date is after today. New dates in the future are refused; correct the legacy ones by hand.
- **Location path inconsistencies.** Locations whose stored `path` does not match the path computed from the parent chain.
- **Collection date not ISO.** Specimens whose collection date is not a real date written `YYYY-MM-DD`. Date filters, exports, and study summaries compare collection dates as text, so these Specimens are missed or placed in the wrong range. Correct the date in the database.
- **Containers with an invalid Grid position.** Tubes or wells whose stored position is not a well or slot of their plate (A01–H12) or box (A01–J10), or is not stored as a row letter plus a two-digit column (`A1` instead of `A01`). Such a tube shows as unplaced, and another tube can be put in its cell. These count toward the overview issue total. Move each one to its real position, or clear the position. An upgrade to schema version 10 repairs the legacy cases automatically: it strips leading dashes (`--A01` becomes `A01`) and clears positions that are the tube's own barcode or `NA`.
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
