---
title: Move collections
description: Relocate plates, boxes, and bags to a different location
---

**Operations → Move Collections** changes the storage location of whole collections. Containers, positions, and specimen links stay the same. This is not the same as [moving containers](/docs/guides/bulk-operations/container-movement/) between plates or boxes.

You can move Micronix Plates, Cryovial Boxes, Boxes, and Bags. Collection detail pages and the Locations page show where a collection is stored but have no move control. Command palette: **Move Collections**.

The wizard has four steps: **Select Collections**, **Choose Destination**, **Review & Confirm**, and **Complete**.

## Select collections

**Select Collections to Move** shows a location tree with every collection, all types together. Check individual collections, click **Select All** on a location, or use **Select All** / **Clear** at the top. Click **Continue with N collections**.

The tree only shows locations that contain collections. A collection with no location assignment may not appear where you expect.

## Choose destination

**Choose Destination Location** is a location tree. All selected collections go to the same destination. The tree shows each location's storage type so you can confirm temperature.

The destination must exist and must be allowed to hold collections. Intermediate locations such as a room often cannot.

## Review and confirm

**Review & Confirm** lists the collections (type and current location) and the destination (storage type and optional description). Choose atomicity:

- **All-or-nothing (default):** for each collection type in the request, any validation error blocks moves for that type.
- **Best effort:** valid moves are applied; invalid rows are returned as errors.

Click **Confirm & Move**.

## Complete

The last step shows how many collections moved and any errors. Click **Move More Collections** to start over.

If a destination is rejected, confirm the location exists and that it can contain collections. Create it on **Locations** first if needed.
