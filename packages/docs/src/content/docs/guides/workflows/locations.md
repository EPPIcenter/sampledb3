---
title: Locations
description: Build and browse the storage hierarchy
---

Locations are the physical places where collections are stored: buildings, rooms, freezers, shelves. They form a tree. A typical path looks like Building A → Room 101 → Freezer A → Shelf 1. Depth is unlimited. Most labs use three to five levels.

Only administrators can create or edit locations. Open **Browse Data → Locations**. Administrators can also open the same page from the Admin Dashboard **Location Management** card, or run **Create Location** in the command palette to open the create form.

Locations are not a Reference Data tab.

## Create locations

When there are no locations, administrators see **Create first location**.

- To add a root location, click **Add Root**.
- To add a child, hold the pointer over a parent in the tree and click the plus icon.

Required: a name. Root locations also require a storage type, for example **-80°C Freezer**. Child locations inherit storage type from the parent. Optional: a description, and whether the location can contain collections (plates, boxes, bags).

Click **Create**. The tree updates in place.

## Browse the tree

Click arrows or names to expand and collapse. Expansion lasts for the current visit and resets when you leave the page.

**Search Collections** finds plates, boxes, and bags by name or barcode. Click a result to open that collection. It does not search location names.

Click a location to select it. The details panel shows name, full path, storage type, description, created and updated times, whether collections can be stored here, lists of Micronix Plates, Cryovial Boxes, Boxes, and Bags, and counts for collections, containers, collection types, child locations, and descendants.

Only locations that can contain collections appear in location pickers when you assign a collection.

## Search locations in pickers

In a **Select location** dialog, type a path with more than one level, separated by `>` or `/`, to narrow the tree.

- A two-part path such as `Bldg > 5` shows that branch and everything under it. Add another segment to go deeper, for example `Bldg > 5 > A` matches *A* as a name prefix on the next level.
- A segment that is only digits matches a whole word in the name: `5` matches `Shelf 5` or a location named `5`, but not `15`.
- A single term without separators still searches names, full paths, and descriptions.

## Move collections

Collection detail pages show the storage path but have no change-location control. To relocate plates, boxes, or bags, use **Operations → Move Collections**. See [Move collections](/docs/guides/features/collection-move/).

## Edit or delete a location

Click **Edit Location** to change name, description, and whether the location can contain collections. Root locations can change storage type. Child locations show **Storage Type (inherited)**. You cannot change the parent in this form.

A location can be deleted only if it has no children and no collections. Move or delete those first. Deletion is permanent.

Storage types themselves are configured in [Reference Data](/docs/guides/reference-data/storage-types/).
