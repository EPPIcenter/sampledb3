---
title: Container Management
description: Organize specimens in containers and collections
---

Containers are the physical storage units that hold your specimens in the real world, and SampleDB helps you track exactly where each sample is stored. Understanding how containers work is essential for managing your laboratory inventory effectively, as it connects your digital records to the physical samples in your freezers and storage units.

SampleDB supports several container types, each designed to match common laboratory storage methods. This flexibility allows you to track samples whether they're stored in small tubes in plates, standard vials in boxes, dried blood spots on paper, or fixed-position containers. Each container type has specific requirements that match how those containers are actually used in the lab.

## Understanding Container Types

The system supports four main container types, each serving different purposes in laboratory workflows.

**Micronix Tubes** are small tubes typically stored in 96-well plates, perfect for DNA samples, small volume aliquots, or other materials that need to be organized in a grid layout. These tubes require a collection (the plate they're stored in), a unique barcode for identification, and a position within the plate. The position format uses a letter followed by two digits, like "A01" for the first position in row A, or "B12" for the last position in row B. This format matches standard 96-well plate layouts where rows are labeled A through H and columns are numbered 01 through 12.

**Cryovial Tubes** are standard cryovial tubes stored in boxes, ideal for larger liquid samples like whole blood, plasma, or serum. These require a collection (the box they're stored in) and a position within that box. The position format depends on your box layout—it might be "A5" for a letter-number combination, or just "25" for a numbered position. Barcodes are optional for cryovial tubes, which gives you flexibility if your lab doesn't barcode every tube.

**Paper containers** represent dried blood spot (DBS) sheets or similar paper-based storage. These are stored in boxes or bags and require a **sheet name** (which sheet within the box or bag) and optionally a **sublabel** (spot identifier on the sheet). Papers do not use tube-style barcodes or grid positions.

**Static Wells** are fixed-position containers in plates, useful for specific assay formats or when you need to track containers that don't move within their plate. Like micronix tubes, they require a collection and position, using the same A01-H12 format for 96-well plates.

## Understanding Collections

Collections are groups of containers organized together, creating a hierarchy that helps you manage your physical inventory. Think of a collection as the physical unit you actually handle—the plate you pull out of the freezer, the box you carry to the bench, or the bag you file away.

**Micronix Plates** hold multiple micronix tubes in a grid layout, typically 96 positions arranged in 8 rows and 12 columns. Each plate has a name (like "PLATE-001") and can optionally have a barcode for easy scanning. The plate is stored at a specific location in your storage hierarchy, which helps you find it when you need it.

**Cryovial Boxes** organize cryovial tubes, and they come in various sizes depending on your lab's equipment. Common sizes include 81 positions (9x9 grid) or 100 positions (10x10 grid), but the system is flexible enough to handle whatever layout your boxes use. Like plates, boxes have names and optional barcodes, and they're stored at specific locations.

**Boxes** are general-purpose containers that can hold paper sheets or other items. They have names and are stored at locations, providing a simple way to organize materials that don't fit the plate or cryovial box model.

**Bags** serve a similar purpose to boxes but are designed for materials that are stored in bags rather than rigid boxes. They're particularly useful for dried blood spot papers or other flexible materials.

**Sheets** are groups of papers within a box or bag. When you add papers to a box or bag, the system automatically organizes them into sheets, which helps you track how papers are grouped together physically.

## Creating Collections

Before you can add containers, you need collections to put them in. Creating collections is straightforward, and you can do it from several places in the interface.

### Creating a Micronix Plate

Micronix plates can be created in several places:

- **Move Micronix Tubes** — When your scan CSV targets a plate that does not exist, the wizard includes a **Create Plates** step: pick a storage location and optionally add a plate barcode. On the upload step you can name a new destination plate yourself (any unique name) from the destination plate picker, even when the file name already matched an existing plate. See [Container Movement](/docs/guides/bulk-operations/container-movement/).
- **Bulk import** — Step 2 (**Create Missing Collections**) when a CSV references a plate that is not in the database.
- **Specimen registration or Add container** — Use **Create new collection** on the plate field when registering a specimen or adding a container (Micronix tube type).

In each case you provide a **name** (e.g. `PLATE-001` or `NAM15-PLATE-01`), a **location** where the plate is stored, and optionally a **barcode** for scanning the physical plate.

Once created, the plate is ready to receive tubes via import, registration, or a micronix move.

### Creating a Cryovial Box

Creating a cryovial box follows a similar process. Select "Cryovial Box" as the collection type, enter a name (like "BOX-001"), select a storage location, and optionally add a barcode if your box has one. The system doesn't require you to specify the box size or layout upfront—it will accommodate whatever positions you use when adding containers.

### Creating Boxes and Bags

For general boxes or bags, the process is even simpler. Select "Box" or "Bag" as the type, provide a name, and select a location. These collections are ready to hold papers or other items as soon as you create them.

## Adding Specimens to Containers

There are two main ways to associate specimens with containers: you can create the container when you register the specimen, or you can add specimens to existing collections later.

### Creating Containers During Specimen Registration

When you're registering a specimen and you know where it will be stored, you can create the container right then. In the specimen registration form, check the "Create container" option, and you'll see additional fields appear. Select the container type that matches your storage method, then either select an existing collection or create a new one on the spot. When choosing a collection, type to search by name; matches show the collection name and storage path (exact and partial matches), and you can create a new collection (name and location) from the same control when the flow allows it.

For each container type, you'll need to provide the appropriate details. Micronix tubes need a barcode (which must be unique across your entire system) and a position in the plate. Cryovial tubes need a position, and you can optionally add a barcode if your lab uses them. Papers need a **sheet name** and can optionally include a **sublabel**. Static wells need a position.

This approach is efficient when you're entering data for specimens that are already physically stored, as it creates the complete record—specimen, container, and collection association—in one step.

### Adding to Existing Collections

If you've already created collections and want to add specimens to them, you can do so from the collection detail page. Navigate to the collection you want to add to, and you'll see options to add specimens. The interface will guide you through selecting the specimen type, providing specimen details, and entering the container information (barcode and position for tubes and wells; sheet name and optional sublabel for paper).

This approach is useful when you're populating a collection over time, or when you're organizing specimens that were registered without containers initially.

### Adding a container from the specimen details page

When viewing a specimen's detail page, you can add a new container for that specimen without re-registering it. In the **Containers** section, click **Add container** to open the form. Choose the container type (allowed types depend on the specimen type), select or create a collection, and enter the required fields (barcode and position for micronix or cryovial tubes; **sheet name** and optional **sublabel** for paper). This is useful when a specimen gains an additional aliquot or is moved to a new container after initial registration.

## Understanding Container Details

When you view a container's detail page, you'll see comprehensive information about that container and its contents. The container type tells you what kind of storage unit it is. Tubes show a barcode and grid position when set; papers show an optional sublabel and the sheet they belong to.

You'll see which collection the container belongs to, and through that collection, which location it's stored at. This creates a complete chain: specimen → container → collection → location, which helps you find any sample in your inventory.

The container's status is automatically determined by its remaining quantity. Containers with remaining quantity greater than zero are marked as "In Use", meaning they still have usable material. Containers with zero remaining quantity are marked as "Exhausted", indicating all the material has been used. This automatic status tracking helps you see at a glance which containers are still available.

The quantities section shows both the total quantity (how much material the container originally held) and the remaining quantity (how much is still available). This helps you track material usage and plan when containers might need to be replenished.

You can add optional notes to a container (for example, storage conditions or handling instructions). Those notes appear on the container detail page and are also shown when viewing the specimen (on the specimen detail page) or when viewing the subject's specimen list, so you can see container notes in context without opening each container.

## Position Formats and Why They Matter

Getting position formats right is important because incorrect positions make it difficult to locate samples later. The system uses specific formats that match common laboratory equipment layouts.

For Micronix tubes and Static Wells, positions use a letter followed by two digits. The letter represents the row (A through H for 96-well plates), and the two digits represent the column (01 through 12). Always use two digits with a leading zero—"A01" is correct, but "A1" is not. This format matches how most laboratory equipment and software expects positions, so using the correct format ensures compatibility with other systems and makes it easier for team members to find samples.

For Cryovial tubes, the position format depends on your box layout. Some boxes use letter-number combinations like "A5" or "B12", while others use just numbers like "1" or "25". The system is flexible enough to accept whatever format matches your boxes, but it's important to be consistent within each box so positions are meaningful.

## Barcode Management

Barcodes are powerful tools for tracking containers, especially when you're working with many samples. For Micronix tubes, barcodes are required and must be unique across your entire system. This uniqueness ensures that when you scan a barcode, you get exactly one container, which is essential for accurate tracking.

**Paper containers** do not use tube barcodes. Optional **sublabels** identify individual spots on a sheet; **sheet name** identifies which sheet within a box or bag. Barcode export and lookup for paper use sublabel, not the tube `barcode` column.

Barcodes are typically alphanumeric and should be in a scannable format if you plan to use barcode scanners. Common formats include prefixes like "MTX-" followed by numbers, or simpler formats like "M001234". Whatever format you choose, document it so team members can follow the same conventions.

Collection barcodes (for plates and boxes) are optional but can be very helpful. If you barcode your collections, you can quickly scan a plate or box to see all the containers it contains, which speeds up inventory management and sample location.

## Exploring Collection Detail Pages

Each collection type has a detail page that shows you everything about that collection and what it contains.

For Micronix Plates, you'll see the plate information including its name, barcode if it has one, and where it's stored. Most usefully, you'll see a grid view showing all positions in the plate. Occupied positions show the container and specimen information, while empty positions are clearly marked. This visual representation makes it easy to see at a glance which positions are used and which are available. Statistics show the total number of positions, how many are occupied, and how many are still available.

Cryovial Box detail pages show similar information but may display containers in a list or grid format depending on the box layout. You'll see each container's position and the specimen it contains, along with statistics about the box's utilization.

Box and Bag detail pages show the box or bag information and list the sheets contained within. If the box or bag contains papers, you'll see those organized by sheet, which helps you understand how papers are grouped together.

Sheet detail pages show information about a specific sheet and list all the papers it contains, along with their associated specimens.

On each of these collection detail pages (plates, cryovial boxes, boxes, bags, and sheets), you can switch to a **Table** view that lists every position or item in a tabular format. Use the **Export CSV** button in the table view to download the current list as a CSV file for use in spreadsheets or other tools.

On **plates, cryovial boxes, general boxes, and bags** (not the sheet-only page), you can use **Delete collection** when you need to remove an entire collection at once. This is intended for fixing a bad import or starting over on a single plate or box, before those containers have been tied into the rest of your work.

## Deleting a collection (entire import rollback)

From a collection detail page for a Micronix plate, cryovial box, box, or bag, open **Delete collection** to remove:

- The collection record itself
- **Every** container in that collection (tubes, wells, papers, etc.)
- **Specimen** records that would have **no** storage left after the operation (if a specimen still has another container somewhere else, that specimen is **kept**)
- Optionally, with the **Also remove study participants (subjects) that have no specimens left** checkbox, **study subjects** who would end up with no specimens (control batches are never removed automatically this way; only subject-linked data)

You must type the **exact** collection name to confirm. The operation is **all or nothing**: it either completes fully, or the system makes **no** changes (see below if something blocks it).

### When deletion is blocked (and support codes)

The system refuses to delete a collection if it would break existing links. You will see a short message plus a list of specific reasons, each with a support **code** you can share or search for in this documentation:

| Code | What it means | What to do next |
|------|---------------|-----------------|
| `qpcr_wells_link_storage_containers` | A physical container in this collection is still assigned on a [qPCR](/docs/guides/features/qpcr-experiments/) experiment well. | In the qPCR workflow, remove that container (or the well’s assignment) from the relevant experiment, then try again. |
| `qpcr_wells_link_specimens` | A specimen you are about to remove is still linked on a qPCR well. | Clear the specimen (or the well) on the qPCR side, then try again. |
| `container_derivation_spans_outside_collection` | A [derivation](/docs/guides/features/derivations/)’s **parent** container is in this collection, but the **child** (derived) container is stored in another collection. Deleting the parent would leave a dangling downstream reference. | Before deleting: move or remove the child, or reassign the derivation, so the parent in this collection is not required for that child. **Note:** Deleting a collection that only contains **child** side(s) of derivations (while the parent lives in another box/plate) is **allowed**—removing a derived aliquot does not break the chain above it. |

If a future product version adds new checks, they will appear with new codes in the same list in the app response. Nothing is partially deleted when you see these errors; fix the listed items and submit again.

## Moving Containers Between Collections

As your laboratory work progresses, you may need to reorganize containers by moving them from one collection to another. This might happen when you're consolidating samples, reorganizing storage, or moving containers to new locations. The system provides tools for moving containers, which are covered in detail in the [Container Movement Guide](/docs/guides/bulk-operations/container-movement/). These tools support moving individual containers or bulk moves using CSV files, depending on your needs.

## Best Practices for Container Management

Effective container management starts with consistent naming conventions. Use clear, consistent names for collections that make sense to your team. Many labs use sequential numbering like "PLATE-001", "PLATE-002", or include study identifiers like "NAM15-PLATE-01". Document your naming scheme so everyone follows the same pattern.

Position management requires attention to detail. Always use the correct position formats, and double-check positions before saving. The grid views available on collection detail pages are excellent for verifying positions visually. If something looks wrong, it probably is—take a moment to verify before proceeding.

Barcode management benefits from planning. If you're using barcodes, establish formats early and stick to them. Consider barcoding collections as well as individual containers, as this makes inventory management much easier. Document your barcode formats so team members can follow them consistently.

Location assignment is crucial for finding samples later. Always assign collections to locations when you create them, and keep your location hierarchy organized. When collections move physically, update their locations in the system so your records stay accurate.

## What's Next?

Now that you understand container management, you might want to learn about [Location Management](/docs/guides/workflows/locations/) to organize your storage infrastructure, explore [Container Movement](/docs/guides/bulk-operations/container-movement/) to learn how to reorganize containers, or dive into [Bulk Import](/docs/guides/bulk-operations/import/) to see how to import specimens with containers efficiently.
