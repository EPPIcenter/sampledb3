---
title: Browsing collections
description: Search and discover plates, boxes, and bags in one place
---

The **Collections** page (Browse Data → Collections) lists micronix plates, cryovial boxes, boxes, and bags in one table. Use it to find a plate or box by name, barcode, or location without walking the location tree.

## Opening the Collections page

In the sidebar, go to **Browse Data → Collections**. You can also press **Ctrl+Shift+K** / **Cmd+Shift+K** and run **Go to Collections**.

## Search

The search box placeholder is **Search by name, barcode, or location**. It filters the table as you type. Slash (`/`) focuses the box when you are not already typing in another field. It matches:

- **Name**: collection name (for example a plate or box name)
- **Barcode**: barcode if the collection has one (micronix plates and cryovial boxes)
- **Location path**: the stored path, using arrows between levels (for example `Freezer A → Shelf 1`)

Search is case-insensitive. You do not need to press Enter. Clear the search box to see all collections again.

## Type tabs

Use the tabs below the page title to restrict the list by collection type:

- **All.** Every collection (default).
- **Micronix Plates**
- **Cryovial Boxes**
- **Boxes**
- **Bags**

The active tab is reflected in the URL (e.g. `?tab=cryovial_box`), so you can bookmark or share a filtered view.

## Table columns and opening a collection

The table shows:

- **Name.** Click the name to open the collection detail page.
- **Type.** Micronix Plates, Cryovial Boxes, Boxes, or Bags.
- **Barcode.** If present.
- **Location.** Full path of the collection's location.
- **Items.** Number of items (tubes, wells, or sheets) in the collection.

You can also click anywhere on a row to open that collection’s detail page. Sorting is available on the Name, Type, and Items columns.

## Pagination

If there are many collections, the table is paginated (e.g. 50 per page). Use the pagination controls below the table to move between pages. The summary text shows how many collections are currently visible and whether the list is filtered.
