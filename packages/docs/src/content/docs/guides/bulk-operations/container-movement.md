---
title: Container Movement
description: Move containers between collections using CSV files
---

Container movement allows you to reorganize containers by moving them from one collection to another. This is essential when you're reorganizing storage, consolidating collections, moving containers to new locations, or restructuring your inventory. The system provides tools for moving containers efficiently, whether you're moving a few items or reorganizing hundreds of containers at once.

The movement process is designed to be safe and reversible where possible. The system validates all moves before executing them, checks for conflicts, and provides clear feedback about what will happen. This validation prevents mistakes and helps ensure your reorganization goes smoothly.

## Understanding Movement Types

SampleDB supports three types of container movement, each designed for different container types and workflows.

**Micronix Container Movement** handles moving micronix tubes between plates. You can identify containers by their barcodes (which is often the most reliable method) or by their positions in the source plate. The system supports uploading multiple CSV files at once, which is useful when you're moving containers from multiple source plates to different destination plates in a single operation.

**Cryovial Container Movement** handles moving cryovial tubes between boxes. Since cryovial tubes might not always have barcodes, this movement type uses positions to identify containers. Like micronix movement, it supports multi-file operations, allowing you to reorganize many containers efficiently.

**Paper Movement** works differently from the other types—it uses a visual interface rather than CSV files. This makes sense because papers are organized into sheets, and it's often easier to see and select sheets visually rather than listing them in a spreadsheet. The interface shows you all sheets in a collection and lets you select which ones to move.

## Moving Micronix Containers

Moving micronix containers between plates is a common task, especially when you're reorganizing storage or consolidating samples. The process starts with preparing a CSV file that specifies which containers to move and where they should go.

### Preparing Your CSV File

Your CSV file needs to identify the containers you want to move and specify their destinations. You can identify containers in two ways: by barcode or by position. Using barcodes is often more reliable because barcodes are unique identifiers, but using positions works well if you know the exact positions.

If you're using barcodes, your CSV needs columns for the source collection name (the plate the container is currently in), the barcode of the container to move, the target collection name (where you want it to go), and the target position in the destination plate. The barcode must match exactly what's in the system, so double-check for typos.

If you're using positions instead of barcodes, your CSV needs the source collection name, the source position (where the container currently is), the target collection name, and the target position. This approach works well when you're moving containers and you know their positions but might not have barcode scanners available.

The target position must be in the correct format for the destination plate. For 96-well plates, use the A01-H12 format with two-digit columns. Make sure the destination position is available or acceptable to overwrite—the system will warn you if you're overwriting an existing container.

### The Movement Process

Navigate to Container Movement → Micronix to start the process. Upload your CSV file (or multiple files if you're doing a larger reorganization), and the system will immediately begin validating and resolving containers. This validation checks that all source containers exist, that they're in the specified source plates, that destination positions are valid, and that there are no conflicts.

The system shows you a list of all containers it found and resolved, which lets you verify that it identified the correct containers. You can review this list to make sure everything looks right before proceeding. If the system can't find a container (perhaps because the barcode is wrong or the position doesn't exist), it will show an error for that row.

If you're using multiple CSV files, you'll need to specify the destination plate for each file. This is useful when different files are moving containers to different destination plates. The system validates that each source plate maps to only one destination across all files, which prevents conflicts where the same source plate would need to go to multiple destinations.

Once everything is validated and you've confirmed the destinations, click "Execute Moves" to perform all the movements. The system processes all moves together, updating container positions and collection associations. When complete, you'll see a summary showing how many containers were successfully moved and any errors that occurred.

## Moving Cryovial Containers

Moving cryovial tubes between boxes follows a similar process to micronix movement, but uses positions to identify containers since cryovial tubes might not always have barcodes.

### Preparing Your CSV File

Your CSV file needs to specify the source box name, the source position (where the container currently is), the target box name, and the target position. The position format depends on your box layout—it might be "A5" for a letter-number combination, or just "25" for a numbered position. Whatever format you use, be consistent within each box.

The system validates that source positions exist and have containers, that target positions are in the correct format, and that positions are available or acceptable to overwrite. This validation prevents mistakes and ensures moves can be completed successfully.

### Executing Cryovial Moves

The movement process for cryovial containers is similar to micronix: upload your CSV file(s), review the resolved containers, specify destinations if using multiple files, and execute the moves. The system handles all the position updates and collection reassignments automatically.

Multi-file operations work the same way as with micronix containers. You can upload multiple CSV files, each potentially targeting a different destination box. The system validates that source boxes map consistently to destinations across all files, preventing conflicts.

## Moving Papers

Paper movement uses a visual interface that's designed for the way papers are organized into sheets. This makes it easier to see what you're moving and select the right sheets.

### The Visual Movement Process

Start by navigating to Container Movement → Papers. The first step is selecting your source collection—the box or bag that contains the sheets you want to move. Once you select a source, the system shows you all sheets in that collection, displaying each sheet with its identifier and how many papers it contains.

You can then select which sheets to move by checking boxes next to each sheet. There's a "Select All" option if you want to move everything, and selected sheets are highlighted so you can see what will be moved. This visual selection makes it easy to choose exactly what you want to move.

Next, select your destination—the box or bag where you want to move the sheets. The destination must be a different collection from the source, which prevents accidentally moving sheets to the same place.

Before executing, you'll see a confirmation screen showing all selected sheets, the source collection, and the destination. Review this carefully to make sure everything is correct, then click "Execute Move" to perform the movement. The system moves all papers in the selected sheets to the destination collection.

After the move completes, you'll see how many sheets were moved successfully. If you realize you made a mistake, there's an undo option available immediately after the move, which moves the sheets back to their original location. This undo is only available right after the move—once you navigate away, it's no longer available.

## Understanding Movement Validation

Before executing any moves, the system performs comprehensive validation to prevent problems. For container resolution, it verifies that all containers exist in the system, checks that they're actually in the specified source collections, validates that barcodes or positions are correct, and confirms that containers haven't been deleted or already moved.

Destination validation checks that destination collections exist, verifies that target positions are in the correct format, and warns if target positions are already occupied. The system may allow overwriting in some cases, but it will warn you so you can make an informed decision.

Conflict detection is especially important in multi-file operations. The system checks that the same source container doesn't appear multiple times with different destinations, and it verifies that source collections map consistently to destinations across all files. If the same source plate appears in multiple files but needs to go to different destination plates, the operation will fail with a clear error message explaining the conflict.

## Executing and Reviewing Moves

Once validation passes, executing the moves is straightforward. Click the execute button, and the system processes all moves together. It updates container positions, changes collection associations, and maintains all the relationships between containers, specimens, and collections.

Container moves support two atomicity modes:

- **All-or-nothing (default):** if any row is invalid, no moves are committed.
- **Best effort:** valid rows are moved and invalid rows are returned as errors.

In both modes, writes are still wrapped in a transaction for the set of rows that will execute. That means write-time failures still roll back that execution set.

After execution, you'll see detailed results. For successful moves, you'll see how many containers were moved. For any failures, you'll see specific error messages explaining what went wrong and which containers had problems. In multi-file operations, you'll see results broken down by file, which helps you understand which files succeeded and which might need attention.

## Undo Operations

Some movement operations support undo, which can be a lifesaver if you realize you made a mistake. Paper movement includes an undo feature that's available immediately after a move completes. If you click undo, the system moves the sheets back to their original collection, effectively reversing the operation.

It's important to note that undo is only available right after the move—once you navigate away from the results page or perform other operations, the undo option is no longer available. This is because the system can't guarantee that undoing later won't conflict with other changes that have been made.

## Best Practices for Container Movement

Effective container movement starts with planning. Before creating your CSV files, map out which containers need to move and where they should go. This planning helps you organize your CSV files logically and catch potential conflicts before you start the process.

When preparing CSV files, use the provided templates if available to ensure your format is correct. Validate position formats carefully—for micronix and static wells, use the "A01" format with two digits. For cryovial tubes, match your box layout. Check for typos in barcodes, collection names, and positions, as these are common sources of errors.

For multi-file operations, organize your moves logically. Group moves by destination when possible, as this makes it easier to verify that everything is going to the right place. Be aware that each source collection can only map to one destination across all files, so plan accordingly.

After moving, always verify the results. Check that containers are in the correct locations by viewing the destination collections. Update any documentation that references the old locations, and notify team members if the reorganization affects how they'll find samples.

## Troubleshooting Movement Issues

If the system can't find a container, verify that the barcode or position is correct. Check that the container is actually in the specified source collection, and ensure the container hasn't been deleted or already moved. Typos in barcodes or collection names are common causes of "container not found" errors.

Invalid position format errors usually mean the position doesn't match the required format. For micronix and static wells, ensure you're using the "A01" format with two-digit columns. For cryovial tubes, verify that positions match your box layout. Check for spaces, typos, or incorrect formats.

If a destination position is already occupied, you have a few options. You can choose a different target position, or if the system allows it, you might be able to overwrite the existing container. Check the warnings the system provides to understand your options.

Source collection conflicts occur in multi-file operations when the same source collection appears in multiple files with different destinations. The system requires that each source collection maps to only one destination, so you'll need to reorganize your CSV files to resolve the conflict. You might need to split moves into separate operations or consolidate files that target the same destination.

## What's Next?

Now that you understand container movement, you might want to learn about [Collection Move](/docs/guides/features/collection-move/) to move entire collections, explore [Container Management](/docs/guides/workflows/containers/) to understand containers better, or review [Location Management](/docs/guides/workflows/locations/) to organize your storage hierarchy.
