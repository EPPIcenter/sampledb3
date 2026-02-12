---
title: Collection Move
description: Move entire collections between locations
---

Collection move allows you to relocate entire collections (plates, boxes, bags) from one storage location to another. This is essential when you're reorganizing storage, moving to new freezers, consolidating locations, or making any changes to your physical storage infrastructure. Unlike moving individual containers, collection move relocates everything in a collection at once, which is much more efficient when entire plates or boxes need to move.

The Collection Move wizard and other storage-related pages use a consistent "modern precision lab" visual theme aligned with the rest of the app; behavior is unchanged.

The system tracks where collections are stored through location assignments, and updating these assignments when collections move physically ensures your records stay accurate. This accuracy is important because it helps you find samples when you need them and maintains proper inventory records.

## Understanding Collection Movement

When you move a collection, you're updating its location assignment in the system to match where it's actually stored physically. The collection itself doesn't change—all the containers it contains stay the same, their positions remain unchanged, and all the specimen associations are preserved. Only the location assignment changes, which updates where the system thinks the collection is stored.

This is different from moving individual containers between collections. Collection move is about relocating storage units (the plates, boxes, or bags themselves), while container movement is about reorganizing samples within or between collections. Both are useful, but they serve different purposes.

## Supported Collection Types

You can move several types of collections, each serving different storage needs. Micronix Plates are plates containing micronix tubes, typically organized in a grid layout. Cryovial Boxes are boxes containing cryovial tubes, which come in various sizes depending on your equipment. Boxes are general-purpose containers that can hold paper sheets or other items. And Bags are similar to boxes but designed for materials stored in bags rather than rigid containers.

All of these collection types can be moved between locations, allowing you to reorganize your storage as your laboratory grows or as storage needs change.

## Moving a Single Collection

The simplest way to move a collection is from its detail page. Navigate to the collection you want to move, and you'll see options to edit the collection or change its location. Click the appropriate button, and you'll see a form or dropdown where you can select the new location.

Select the location where the collection is now stored (or will be stored), and save the change. The system immediately updates the location assignment, and the collection will appear in the new location's contents list. All containers in the collection remain associated with it, and all their relationships are preserved—only the location changes.

You can also move collections from the Locations page, which provides a different interface that some people find more intuitive. Find the collection in the location tree (it will be listed under its current location), and you can use collection actions to move it. Right-click or use action buttons to access the move option, then select the destination location.

## Bulk Collection Movement

When you need to move multiple collections at once—perhaps when reorganizing an entire freezer or moving collections to a new storage facility—bulk movement tools make this much more efficient than moving collections one at a time.

Navigate to the Collection Move section (if available in your navigation) to access bulk movement tools. Start by selecting the collection type you want to move: Micronix Plates, Cryovial Boxes, Boxes, or Bags. This tells the system what kind of collections to expect in your movement list.

You can identify collections in several ways. By ID works if you know the collection IDs, which you can find on collection detail pages. By Name lets you enter collection names, and you can optionally specify a location to help the system find the right collection if names aren't unique. By Barcode works if your collections have barcodes, and again you can optionally specify a location.

Once you've identified the collections you want to move, you'll select a destination location. In bulk operations, all selected collections move to the same destination location, which is efficient when you're moving everything to a new freezer or storage area. The move flow shows each location’s **storage type** (e.g. -80°C, room temp) and optional **description** in the tree and on the review step, so you can confirm you’re moving to the right kind of storage before confirming.

The system validates that all collections exist, that the destination location is valid and can contain collections, and that you have permission to perform the moves. Once validation passes, you can execute the moves, and the system will update all location assignments in one operation.

### Atomicity Modes for Bulk Moves

Bulk collection move supports two atomicity modes:

- **All-or-nothing** (default): if any row is invalid, no collections are moved.
- **Best effort**: valid rows are moved in one transaction while invalid rows are returned as errors.

If your workflow requires strict consistency, use the default all-or-nothing mode. Use best effort when you want to move valid rows immediately and fix failed rows afterward.

## CSV-Based Bulk Movement

Some workflows support CSV files for bulk collection movement, which is useful when you have many collections to move and want to prepare the list in a spreadsheet. Your CSV file would include collection identifiers and target locations, and the system processes all moves together.

This approach is particularly useful when you're doing large-scale reorganizations and want to plan your moves in advance. You can prepare the CSV file, review it, and then execute all moves at once when you're ready.

## Location Requirements and Validation

Before collections can be moved, the system validates several things. The source location must be valid and the collection must actually be stored there (according to system records). The destination location must exist and must be configured to allow collections—not all locations can directly hold collections. Some locations are intermediate organizational units (like "Room") that contain other locations but don't directly hold collections.

The system checks these requirements before allowing moves, which prevents problems like trying to move collections to inappropriate locations or to locations that don't exist.

## Understanding Movement Results

After moving collections, you'll see results that confirm what was moved successfully and highlight any problems. The success count shows how many collections were successfully moved. If any collections failed to move, you'll see an error list explaining what went wrong—perhaps a collection doesn't exist, or a destination location isn't valid.

These results help you verify that your reorganization was successful and identify any collections that need attention. If some moves failed, you can address the issues and try again for those specific collections.

## Verifying Moves

After moving collections, it's important to verify that the moves were recorded correctly. Check that collections appear at their new locations by navigating to those locations and viewing their contents. Verify that all containers are still associated with their collections correctly—moving a collection shouldn't affect the containers it contains, but it's good to confirm.

Check that location statistics have updated correctly, as these help you understand storage distribution. And if you've moved collections physically in the real world, make sure your system records match reality. Accurate location records are essential for finding samples later.

## Best Practices for Collection Movement

Effective collection movement starts with planning. Before executing moves, map out which collections need to move and where they should go. This planning helps you organize bulk moves efficiently and catch potential problems before you start.

Verify that destination locations exist and are appropriate before moving collections. Check that locations can contain collections (the capability setting), and ensure locations are in the correct hierarchy. Creating locations before you need them makes moves smoother.

During movement, move related collections together when possible. If you're reorganizing a freezer, move all collections from that freezer together rather than doing them one at a time. Use consistent destinations—if you're moving everything to a new location, use that location consistently.

After moving, verify locations are correct by checking that collections appear where you expect them. Update any documentation that references old locations, and notify team members of location changes so they know where to find samples. If you've moved collections physically, update physical labels if needed to match system records.

## Troubleshooting Movement Issues

If the system can't find a collection to move, verify that the collection identifier is correct. Check that the collection exists in the system, ensure the collection type matches what you selected, and verify the collection hasn't been deleted. Typos in collection names or barcodes are common causes of "collection not found" errors.

If you can't assign a collection to a destination location, verify that the destination location exists. Check that the location can contain collections (the capability setting), ensure the location is in the correct hierarchy, and create the location if it doesn't exist. Verify that location names or paths are correct if you're specifying them manually.

If a movement operation fails, there could be several causes. The collection might be locked or in use by another operation. You might not have sufficient permissions to move collections. Or there could be a system error. Try moving individual collections to isolate the problem, check system status, and contact your administrator if the issue persists.

## What's Next?

Now that you understand collection movement, you might want to learn about [Location Management](/guides/workflows/locations/) to organize your storage hierarchy, explore [Container Movement](/guides/bulk-operations/container-movement/) to move individual containers, or review [Container Management](/guides/workflows/containers/) to understand how collections work.
