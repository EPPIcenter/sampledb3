---
title: Common issues
description: Import, container, location, and export errors
---

## Import

Read the validation messages first. They name the row and the problem. Nothing is written until validation passes.

**Missing columns or bad headers.** Add the columns named in the error. Import headers are case-insensitive (`position` and `Position` both work). Download a template for the current import type and compare.

**Study not found.** The `study_short_code` must match an existing study, including capitalization. Create the study first if it is missing.

**Subject already exists.** For **Specimens Only**, subjects must already exist. For **Combined**, existing subjects are reused and specimens are added. For **Subjects Only**, each name must be new in the study.

**Collection not found.** Use the **Create Missing Collections** step, or fix the name or barcode in the CSV.

**Invalid position.** For micronix and static wells, stored form is `A01` (letter A-H plus two digits). `A1` and `a1` are accepted and padded to `A01`. `B012` is not valid. For cryovial, match the box layout and stay consistent within the box.

For more column rules, see [CSV file guidelines](/docs/guides/troubleshooting/csv-guidelines/) and [Bulk import](/docs/guides/bulk-operations/import/).

## Containers

**Not found.** Check barcode or position, collection, and that the container was not deleted. Identifiers must match exactly.

**Barcode already exists.** Micronix barcodes are unique across the system. Use a different barcode or open the existing container.

**Position occupied or out of range.** `A13` is invalid on a 96-well plate (columns 01-12). Pick an empty well.

## Locations

**Location not found.** Browse the tree on **Browse Data → Locations**. **Search Collections** finds plates, boxes, and bags, not locations. Search locations by path in the **Select location** picker. See [Locations](/docs/guides/workflows/locations/).

**Cannot assign a collection.** The destination must exist and must be allowed to hold collections.

## Export

**No results.** Confirm subjects exist, then loosen filters or date tolerance. See the export summary: **No Results** vs **Not Found**.

**Missing columns.** Check the selected **Export configuration**. Collection table **Export CSV** uses table-view columns, not export configurations.

Invalid study codes block **Multi-Study Export** until you fix the CSV and upload again. See [Multi-study export](/docs/guides/bulk-operations/export/).
