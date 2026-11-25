---
title: Locations
description: Build and browse the storage hierarchy
---

Locations are the physical places where collections are stored: buildings, rooms, freezers, shelves. They form a tree. A typical path looks like Building A → Room 101 → Freezer A → Shelf 1. Depth is unlimited. Most labs use three to five levels.

Members and administrators can create locations and delete empty ones. Only administrators can edit a location. Viewers can browse the tree.

Open **Browse Data → Locations**. To open the create form from any page, run **Create Location** in the command palette. Administrators can also open the page from the Admin Dashboard **Location Management** card.

Locations are not a Reference Data tab.

## Create locations

When there are no locations, members and administrators see **Create first location**.

- To add a root location, click **Add Root**.
- To add a child, hold the pointer over a parent in the tree and click the plus icon.

Required: a name. Root locations also require a storage type, for example **-80°C Freezer**. Child locations inherit storage type from the parent. Optional: a description, and whether the location can contain collections (plates, boxes, bags).

Click **Create**. The tree updates in place.

## Browse the tree

Click the arrow beside a location to expand or collapse it. Click a location's name to select it, which also expands it. Click the selected location's name again to collapse it. Expansion lasts for the current visit and resets when you leave the page.

**Search Collections** finds plates, boxes, and bags by name or barcode. Click a result to open that collection. It does not search location names.

For the selected location, the details panel shows name, full path, storage type, description, created and updated times, whether collections can be stored here, lists of Micronix Plates, Cryovial Boxes, Boxes, and Bags, and counts for collections, containers, collection types, child locations, and descendants.

Only locations that can contain collections appear in location pickers when you assign a collection.

## Search locations in pickers

In a **Select location** dialog, type a path with more than one level, separated by `>` or `/`, to narrow the tree.

- A two-part path such as `Bldg > 5` shows that branch and everything under it. Add another segment to go deeper, for example `Bldg > 5 > A` matches *A* as a name prefix on the next level.
- A segment that is only digits matches a whole word in the name: `5` matches `Shelf 5` or a location named `5`, but not `15`.
- A single term without separators still searches names, full paths, and descriptions.

## Move collections

Collection detail pages show the storage path but have no change-location control. To relocate plates, boxes, or bags, use **Operations → Move Collections**. See [Move collections](/docs/guides/features/collection-move/).

## Edit or delete a location

Hold the pointer over a location in the tree to show its controls. Members and administrators see a plus icon to add a child and a trash icon to delete. Administrators also see a pencil icon to edit. Viewers see no icons.

Only administrators can edit a location. Click the pencil icon to open the **Edit Location** form. You can change the name, the description, and whether the location can contain collections. A root location can also change its storage type. A child location shows **Parent Location** and **Storage Type (inherited)**, and you cannot change either. SampleDB has no control for moving a location under a different parent.

You cannot clear **Can Contain Collections** while the location holds collections. The form tells you how many it holds. Move them to another location first.

Members and administrators can delete a location, but only if it has no child locations and holds no collections. Click the trash icon. For an empty location, the dialog asks you to confirm. Deletion is permanent. If the location has child locations or holds collections, the dialog says so and you cannot click **Delete**. Delete the child locations or move the collections first.

If someone adds a child location or a collection after you opened the page, SampleDB refuses the delete. A message at the top right of the page gives the reason, and the tree reloads.

If you are a member and you created a location with the wrong name, delete it while it is still empty and create it again. To rename a location that already holds collections, ask an administrator.

Storage types themselves are configured in [Reference Data](/docs/guides/reference-data/storage-types/).
