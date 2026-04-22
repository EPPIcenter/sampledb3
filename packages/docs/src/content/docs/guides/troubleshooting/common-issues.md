---
title: Common Issues
description: Solutions to frequently encountered problems
---

This guide addresses common issues you might encounter while using SampleDB and provides solutions to resolve them. Most problems have straightforward solutions, and understanding these common issues helps you resolve them quickly when they occur.

## Import Issues

Import problems are among the most common issues, usually related to CSV file formatting or data validation. Understanding how to diagnose and fix these issues helps ensure smooth imports.

### Import Validation Errors

If your CSV file fails validation, the system will show specific error messages that indicate what's wrong. Common causes include missing required columns, incorrect column names, invalid data formats, or missing required values.

To resolve validation errors, start by checking the error messages carefully—they tell you exactly what needs to be fixed. Verify that all required columns are present in your CSV file, and check that column names match exactly (they're case-sensitive). Ensure all required fields have values—empty cells in required columns will cause validation to fail.

Download a template from the system and compare your file to ensure the format is correct. Templates show the exact column names and formats expected. Fix any errors you find and re-upload the file. The validation step is designed to catch problems before import, so fixing validation errors prevents data problems later.

### Study Code Not Found

If import fails because a study code doesn't exist, the solution is usually straightforward. Verify that the study short code in your CSV is correct—check for typos, as study codes are case-sensitive and must match exactly. Ensure the study exists in the system by checking the Studies page. If the study doesn't exist, create it first before importing data. Check that the study code format matches exactly what's in the system, including capitalization and any prefixes or suffixes.

### Subject Already Exists

If you see a warning that a subject already exists during import, the behavior depends on your import type. For "Specimens Only" imports, this is expected—subjects should exist before you add specimens to them. For "Combined" imports, existing subjects are used rather than duplicated, which is the correct behavior.

If you need new subjects, use different subject names in your CSV. If this warning appears unexpectedly, check your CSV for duplicate subject names within the same study. The system prevents duplicate subjects within a study, which helps maintain data integrity.

### Collection Not Found

If import fails because a collection doesn't exist, you have a couple of options. During the import process, Step 2 allows you to create missing collections. You can create them there, or create collections manually before importing. Verify that collection names match exactly, including any prefixes, suffixes, or formatting. If you're using collection barcodes, check that those match as well.

### Invalid Position Format

Position format errors are common and usually easy to fix once you understand the requirements. For Micronix tubes and Static Wells, positions must use the "A01" format: a letter (A-H) followed by two digits (01-12), with the digits zero-padded. "A01" is correct, but "A1" is not.

For Cryovial tubes, positions depend on your box layout. They might be "A5" for letter-number combinations, or just "25" for numbered positions. Whatever format you use, be consistent within each box.

Common mistakes include missing the leading zero (using "A1" instead of "A01"), including spaces, using lowercase letters when uppercase is required, or using too many digits. Check for these issues and correct them.

## Container Issues

Container-related problems often involve barcodes, positions, or container identification.

### Container Not Found

If the system can't find a container, verify that the barcode or position is correct. Check that the container exists in the system and hasn't been deleted. Ensure the container is in the specified collection, and check for typos in identifiers. Barcodes and positions are case-sensitive and must match exactly.

### Barcode Already Exists

If you can't create a container because the barcode already exists, remember that each barcode must be unique across your entire system. Check if the container already exists—you might be trying to create a duplicate. Use a different barcode if needed, and verify you're not accidentally duplicating existing containers.

### Invalid Position

If a position is invalid or already occupied, check that the position format is correct for your container type. Verify the position is within the collection's bounds—for example, "A13" would be invalid for a 96-well plate that only has columns 01-12. Check if the position is already occupied by another container, and choose a different position if needed.

## Location Issues

Location problems usually involve hierarchy or assignment issues.

### Location Not Found

If you can't find a location, verify the location name is correct and check for typos. Use the search function to find locations by name or path, and verify the location exists in the system. If you're looking in the wrong interface (tree view vs. list view), try the other interface.

### Cannot Assign Collection to Location

If you can't assign a collection to a location, verify that the destination location exists. Check that the location can contain collections—not all locations are configured to hold collections directly. Ensure the location is in the correct hierarchy, and create the location if it doesn't exist yet.

### Location Hierarchy Problems

If location hierarchy isn't working as expected, verify that parent locations exist before creating child locations. Check that the hierarchy structure makes logical sense, and ensure locations aren't creating circular references (a location being its own ancestor). Review the hierarchy in both the tree view and list view to get a complete picture.

## Export Issues

Export problems often relate to filters, configurations, or data selection.

### Export Returns No Results

If an export doesn't find any containers, check that your subject list CSV is correct and that subjects exist in the system. Review your filters—they might be too restrictive and excluding all containers. If you're using collection dates, check the date tolerance setting, as it might be too strict.

### Export Missing Expected Data

If your export seems to be missing data you expect, review the export summary to see what was actually included. Check your filters to ensure they're not excluding the data you want. Verify that the data exists in the system and matches your search criteria. Review the export configuration to ensure it includes the columns you need.

## General Troubleshooting Tips

When encountering issues, start by checking error messages carefully—they usually tell you exactly what's wrong. Verify that data exists in the system and matches what you're searching for. Check for typos in names, codes, or identifiers, as these are common causes of "not found" errors.

Use the system's validation features before committing to operations—validation catches many problems early. Review system requirements and ensure your data meets them. If problems persist, check system status or contact your administrator for assistance.

## Getting Additional Help

If you've tried the solutions in this guide and problems persist, there are additional resources available. Review the [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/) for detailed formatting requirements. Check [Best Practices](/docs/guides/troubleshooting/best-practices/) for recommended workflows that can prevent issues. Contact your system administrator if problems seem to be system-related or if you need assistance with configuration issues.

## What's Next?

Now that you understand common issues and their solutions, you might want to review [Best Practices](/docs/guides/troubleshooting/best-practices/) to learn workflows that prevent problems, check [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/) for detailed import requirements, or explore the relevant feature guides to understand how features work correctly.
