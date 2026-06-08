---
title: Container Movement
description: Move containers between collections using CSV files
---

Container movement allows you to reorganize containers by moving them from one collection to another. This is essential when you're reorganizing storage, consolidating collections, moving containers to new locations, or restructuring your inventory. The system provides tools for moving containers efficiently, whether you're moving a few items or reorganizing hundreds of containers at once.

The movement process is designed to be safe and reversible where possible. The system validates all moves before executing them, checks for conflicts, and provides clear feedback about what will happen. This validation prevents mistakes and helps ensure your reorganization goes smoothly.

## Understanding Movement Types

SampleDB supports three types of container movement, each designed for different container types and workflows.

**Micronix Container Movement** handles moving micronix tubes between plates using a **plate scan CSV**—the same format produced by your scanner and used for plate scan validation. You upload one or more files; each file describes the **destination** plate layout (barcode and well position per row). Tubes are identified by **barcode**; the system resolves each barcode to its current source plate automatically. If the destination plate does not exist yet, the wizard can **create it** before resolving tubes. Multi-file upload is supported when you are moving tubes from several source plates to different destination plates in one operation.

**Cryovial Container Movement** handles moving cryovial tubes between boxes. Since cryovial tubes might not always have barcodes, this movement type uses positions to identify containers. Like micronix movement, it supports multi-file operations, allowing you to reorganize many containers efficiently.

**Paper Movement** works differently from the other types—it uses a visual interface rather than CSV files. This makes sense because papers are organized into sheets, and it's often easier to see and select sheets visually rather than listing them in a spreadsheet. The interface shows you all sheets in a collection and lets you select which ones to move.

## Moving Micronix Containers

Moving micronix containers between plates is a common task, especially when you're reorganizing storage or consolidating samples. The process starts with preparing a CSV file that specifies which containers to move and where they should go.

### Preparing Your CSV File

Micronix moves use a **full plate scan** CSV, not a row-per-move spreadsheet with source and destination columns. Each file represents one destination plate after the move.

With the default **Traxcer** scanner configuration, the columns are **Tube ID** (barcode) and **Position** (target well on the destination plate, e.g. A01). Other scanner configurations use different column names; choose the configuration that matches your export in **Settings → Scanner configurations**.

**Requirements:**

- The CSV must list **all 96 well positions** (A01–H12) exactly once, as produced by scanning software.
- Each row with a barcode moves that tube to the given position on the destination plate.
- Leave the barcode cell **empty** for wells that should be empty on the destination.
- Positions use the **A01** format: a letter (A–H) followed by two zero-padded digits (01–12). `A1` is not valid.

**Destination plate name** comes from the **file name** (default) or from a **CSV column** that repeats the plate name on every row, depending on your scanner configuration. Name the file after the destination plate (e.g. `PLATE-002.csv`). The system strips `.csv` and common date/time suffixes (e.g. `_2024-01-15`) when inferring the name.

When using multiple CSVs targeting the **same** destination plate, the files together form the move. If a well is empty in your upload but currently has a tube on that destination plate, that tube must appear elsewhere in the move (in any CSV targeting that plate) so it is relocated and no tube is lost.

### The Movement Process

Open **Storage → Move Micronix Tubes** (or use the command palette: **Move Micronix Containers**). The wizard has up to four steps:

1. **Upload & Configure** — Select a scanner configuration, upload one or more CSV files, and confirm the destination plate for each file.
2. **Create Plates** *(only when needed)* — If a destination plate name does not exist in the database, assign a storage location (and optional plate barcode) for each new plate, then continue.
3. **Resolve** — The system looks up each barcode, shows source plates, lists any unresolved barcodes, and lets you choose **atomicity mode** before executing.
4. **Execute** — Moves are committed; you see per-file results and any errors.

**Upload & Configure**

Choose a scanner configuration that matches your CSV format. Upload your file(s). If you change the configuration after uploading, the system re-validates automatically.

For each file, confirm the **destination plate**:

- If the inferred name matches exactly one existing plate, it is auto-selected. You can still choose a **different** destination — open the destination plate picker and select another existing plate, or create a new plate with **any name** (see below).
- If the name matches no plate, it is treated as a **new plate** (shown as “New plate — assign a storage location in the next step”).
- If several plates partially match, pick the correct one from the destination plate picker (search by name, barcode, or location).

**Creating a new destination plate (any name)**

Open the **destination plate picker** for a file. At the bottom of the picker, use **Create new plate**: enter the plate name you want and click **Use name**. The name does not have to match the CSV file name — for example, you can upload `PLATE-001.csv` (which auto-selects an existing `PLATE-001`) and still target a brand-new plate named `PLATE-001-RUN2`. If your search text does not match any existing plate, a **Create new plate: …** shortcut appears above the list. Names must be unique; if a plate with that name already exists, select it from the list instead.

When a new name is selected, the picker shows **New plate** and the upload step reminds you that a storage location is assigned on the next step.

Click **Next: Create Destination Plates** when any destination is new, or **Next: Resolve Containers** when all destinations already exist.

**Create Plates**

For each new destination plate, pick a **location** (required) and optionally enter a **plate barcode**. Click **Create Plates & Continue**. Plates are created in the database before tube resolution runs.

If you return to this step after plates were already created, use **Continue to Resolve** instead of creating duplicates.

**Resolve**

Review resolved tubes, source plates detected, and any **unresolved** barcodes (not found in the database). Fix typos in your CSV on the Upload step if needed.

Choose **atomicity mode**:

- **All-or-nothing (default):** any invalid row blocks all moves.
- **Best effort:** valid rows are moved; invalid rows are returned as errors.

Click **Execute Moves** when ready. Use **Back** to return to Upload (or Create Plates if destinations still need to be created).

**Multiple files**

When using several CSV files, each file targets its own destination plate. In **Settings → Scanner configurations**, **Destination plate** can be **File name** (default) or **CSV column**. With **File name**, the system derives a stem from the file (without path, `.csv`, and common date suffixes) and matches it against plate names (exact, then partial). With **CSV column**, the same plate name must appear in that column on every data row; if more than one distinct value appears, the upload is rejected. If exactly one plate’s name **equals** the inferred stem (case-insensitive), that plate is auto-selected—even when other plates only *contain* the stem (e.g. stem `PLATE-A` selects `PLATE-A`, not `PLATE-A-BACKUP`). If there is no unique exact match but exactly one partial match exists, that plate is auto-selected. Otherwise choose from the list. The system validates that each source plate maps to only one destination across all files, which prevents conflicts where the same source plate would need to go to multiple destinations.

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

Destination validation checks that destination collections exist (or will be created on the Create Plates step), verifies that target positions are in the correct format, and ensures tubes on the destination plate are not lost when a well is scanned empty. Relocation validation runs before the Resolve step: if a well is empty in your upload but currently occupied on the destination plate, that tube must appear at another position in the same move batch.

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

When preparing CSV files, export a full plate scan from your scanner (or match the column layout in **Settings → Scanner configurations**). Validate position formats carefully—for micronix and static wells, use the "A01" format with two digits. For cryovial tubes, match your box layout. Check for typos in barcodes, collection names, and positions, as these are common sources of errors.

For multi-file operations, organize your moves logically. Group moves by destination when possible, as this makes it easier to verify that everything is going to the right place. Be aware that each source collection can only map to one destination across all files, so plan accordingly.

After moving, always verify the results. Check that containers are in the correct locations by viewing the destination collections. Update any documentation that references the old locations, and notify team members if the reorganization affects how they'll find samples.

## Troubleshooting Movement Issues

If the system can't find a container during micronix move **Resolve**, verify barcodes in the CSV match the database exactly. Unresolved tubes are listed on the Resolve step; go **Back** to Upload, fix the CSV, and run **Next: Resolve Containers** again. You do not need to recreate destination plates that already exist.

If you see relocation errors on Upload (tube at an empty well “not relocated”), ensure every tube currently on the destination plate either stays in place (barcode in that well) or appears at another well in the same move batch.

If a destination position is already occupied by a different tube, the move may fail at execution depending on atomicity mode. Adjust positions in your scan CSV or resolve conflicts before executing.

Source collection conflicts occur in multi-file operations when the same source collection appears in multiple files with different destinations. The system requires that each source collection maps to only one destination, so you'll need to reorganize your CSV files to resolve the conflict. You might need to split moves into separate operations or consolidate files that target the same destination.

## What's Next?

Now that you understand container movement, you might want to learn about [Collection Move](/docs/guides/features/collection-move/) to move entire collections, explore [Container Management](/docs/guides/workflows/containers/) to understand containers better, or review [Location Management](/docs/guides/workflows/locations/) to organize your storage hierarchy.
