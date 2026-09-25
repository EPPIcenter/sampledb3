---
title: Containers
description: Track tubes, papers, wells, and the collections that hold them
---

A **container** is the physical unit that holds specimen material. A **collection** is the plate, box, or bag you handle as one piece. The stored chain is Specimen → Container → Collection → Location. A specimen can exist without a container until it is stored.

## Container types

**Micronix Tubes.** Small tubes in 96-well plates. Require a plate, a unique barcode, and a position (`A01` through `H12`).

**Cryovial Tubes.** Vials in boxes. Require a box and a position. Position format follows the box (`A5` or `25`). Barcode is optional.

**Papers.** Dried blood spot sheets in a box or bag. Require **sheet name**. Optional **spot label**, stored as `sublabel` in CSV and API data. Papers do not use tube barcodes or grid positions.

**Static Wells.** Fixed wells in a plate. Require a collection. Position is optional and uses the same A01-H12 format as micronix.

## Collection types

**Micronix Plates.** Named plates, optional barcode, stored at a location. Typically 8×12.

**Cryovial Boxes.** Named boxes, optional barcode. Layout is not declared up front; positions are whatever you enter when adding tubes.

**Boxes** and **Bags.** Hold paper sheets. **Sheets** group papers inside a box or bag.

## Create a collection

There is no standalone "create plate" page. Collections are created when a workflow needs them:

- **Move Micronix Tubes** or **Move Cryovial Tubes:** **Create Plates** or **Create Boxes** when the destination does not exist. See [Container movement](/docs/guides/bulk-operations/container-movement/).
- **Bulk import:** **Create Missing Collections** when the CSV names a collection that is not in the database.
- **Specimen registration** or **Add container:** **Create new collection** on the collection field.

You provide a name, a location, and optionally a barcode.

## Add a container to a specimen

On the specimen form, select **Add Container** under Container Registration. Type to search collections by name; matches show name and storage path. You can create a new collection from the same control when the flow allows it.

- Micronix: unique barcode and position.
- Cryovial: position, optional barcode.
- Paper: **sheet name**, optional **spot label**.
- Static wells: position optional.

**Unit (Optional)** and total and remaining quantity are prefilled for the type.

Collection detail pages do not have an add-specimens control. To put a specimen in an existing collection, register it with **Add Container** checked, use **Add container** on the specimen detail page, or use [Bulk import](/docs/guides/bulk-operations/import/).

### Add container from specimen details

On the specimen detail page, in **Containers**, click **Add container**. Choose the type allowed for that specimen type, select or create a collection, and enter the required fields.

## Container detail page

Shows type, barcode or sublabel, grid position or sheet, collection, location, and status. Status is **In Use** when remaining quantity is greater than zero, and **Exhausted** when it is zero. Notes appear here and on the specimen and subject pages.

## Position and barcode rules

Micronix and static wells: letter plus two digits. `A01` is stored; `A1` is padded to `A01`. Cryovial: match the box and stay consistent inside it.

Micronix barcodes must be unique across the system. Paper uses **sheet name** and optional **sublabel**, not the tube `barcode` column. Collection barcodes are optional.

## Browse collections

Open **Browse Data → Collections**. Tabs: **All**, **Micronix Plates**, **Cryovial Boxes**, **Boxes**, **Bags**. See [Browsing collections](/docs/guides/features/browse-collections/).

Plate pages include a grid of occupied and empty wells. Box and bag pages list sheets. Every collection type has a **Table** view and **Export CSV**, which downloads the rows currently shown.

## Delete a collection

On a plate, cryovial box, box, or bag (not the sheet-only page), **Delete collection** removes:

- The collection
- Every container in it
- Specimen records that would have no storage left (a specimen with another container elsewhere is kept)
- Optional: with **Also remove study participants (subjects) that have no specimens left**, subjects who would have no specimens. Control batches are never removed this way.

Type the exact collection name to confirm. The operation is all or nothing.

### When deletion is blocked

| Code | Meaning | What to do |
|------|---------|------------|
| `qpcr_wells_link_storage_containers` | A container is assigned on a qPCR well. | Clear that assignment, then try again. See [qPCR experiments](/docs/guides/features/qpcr-experiments/). |
| `qpcr_wells_link_specimens` | A specimen you would remove is still on a qPCR well. | Clear the well, then try again. |
| `container_derivation_spans_outside_collection` | A derivation parent is in this collection and the child is in another. | Move or remove the child, or reassign the derivation. Deleting a collection that only holds child containers is allowed. |

Nothing is partially deleted. Fix the listed codes and submit again.

To move tubes between plates, see [Container movement](/docs/guides/bulk-operations/container-movement/). To move a whole plate or box to a new freezer, see [Move collections](/docs/guides/features/collection-move/).
