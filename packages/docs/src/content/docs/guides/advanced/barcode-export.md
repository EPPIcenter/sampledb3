---
title: Barcode Export
description: Export containers by scanning barcodes
---

Barcode export allows you to quickly export container data by scanning or entering barcodes. This is incredibly useful when you need to prepare specific samples for analysis, generate reports for containers you've physically scanned, or create datasets based on containers you've selected from your physical inventory. Instead of searching through the system to find containers, you can simply scan their barcodes and export their data immediately.

This workflow is particularly valuable in laboratory settings where you're working with physical samples. You might scan containers as you pull them from storage, scan them during quality control checks, or scan them when preparing samples for analysis. The barcode export feature turns those scanned barcodes into exportable data quickly and accurately.

## Accessing Barcode Export

You can access barcode export from the sidebar by navigating to Barcode Export, or you can use the command palette (press Ctrl+K or Cmd+K) and search for "Export by Barcodes". The command palette approach is convenient when you're already working in another part of the system and want to quickly jump to barcode export.

## Entering Barcodes

The system provides several ways to enter barcodes, each suited to different workflows. Manual entry lets you type or paste barcodes directly into an input field. You can enter one barcode per line, or use comma-separated values if you prefer. This is useful when you have a list of barcodes from another source, or when you need to enter just a few barcodes quickly.

Barcode scanner input is captured automatically when you use a barcode scanner. Each scan adds a barcode to the list, making it easy to quickly scan many containers. This is the fastest method when you're working with physical containers and have a scanner available. The system captures scanner input just like keyboard input, so scanning feels natural and fast.

File upload lets you upload a file containing barcodes, with one barcode per line. This supports both plain text files and CSV files, giving you flexibility in how you prepare your barcode list. This is useful when you have a list of barcodes prepared in advance, perhaps from another system or from a previous export.

## Processing and Validating Barcodes

Once you've entered barcodes, the system processes them to find matching containers. It validates that barcodes exist in the system, checks that containers haven't been deleted, and resolves each barcode to its container. This validation happens automatically and provides immediate feedback about which barcodes were found and which couldn't be located.

The system shows you a list of found containers, displaying key information like container type, specimen type, collection, and location. This preview helps you verify that the system found the correct containers before you export. If a barcode wasn't found, it's listed separately so you can address it—perhaps the barcode was entered incorrectly, or the container doesn't exist in the system.

## Configuring Your Export

Before exporting, you can configure what data to include and how it should be formatted. Export format options include CSV (comma-separated values), which works with spreadsheets and most analysis tools; XLSX (Excel format), which is convenient if you're primarily working in Excel; and JSON (structured data format), which is useful for programmatic access or importing into other systems.

Export configuration determines which columns appear in your exported file. You can use the default configuration, which includes all available columns, or select a custom configuration that includes only the columns you need. Custom configurations are managed in Settings and let you create predefined column sets for specific purposes—perhaps a "Minimal Export" with just identifiers and basic information, or an "Analysis-Ready" configuration with all columns needed for statistical analysis.

## Common Use Cases

Barcode export is particularly useful in several common scenarios. When preparing samples for analysis, you might scan the barcodes of containers you're pulling from storage, then export their data to use in your analysis workflow. This ensures you have complete information about the samples you're analyzing, and the export file can be used directly in analysis software or shared with collaborators.

For quality control checks, scanning containers during QC and exporting their data lets you verify container information against physical containers. You can check that locations are correct, verify specimen types match labels, and ensure all information is accurate. The export provides a record of what was checked and can be used for QC documentation.

During inventory audits, scanning containers and exporting their data helps generate audit reports. You can verify container locations match where they're actually stored, check container status (In Use vs. Exhausted), and verify that system records match physical inventory. The export provides a complete record of what was audited.

## Best Practices for Barcode Export

Effective barcode export starts with accurate barcode entry. Verify that scanned barcodes are correct—if a scanner misreads a barcode, you'll get incorrect results. Review the found containers list to ensure the system identified the right containers. If something looks wrong, check the barcode and try again.

Choose the export format that matches your needs. CSV is the most universal and works with most tools, but XLSX might be better if you're primarily working in Excel. JSON is useful for programmatic access but less convenient for manual review.

Use appropriate export configurations to get the columns you need without overwhelming your export with unnecessary data. If you regularly export for the same purposes, create custom configurations to save time and ensure consistency.

Save your export files for records, especially if you're using them for important analyses or sharing them with collaborators. Having the original export files makes it easy to reference what data was included and when it was exported.

## Troubleshooting Barcode Issues

If the system can't find a container with a scanned barcode, there are several possible causes. The barcode might be incorrect—check for typos if you entered it manually, or verify the scanner read it correctly. The container might not exist in the system, perhaps because it was never created or was deleted. Ensure the barcode hasn't been deleted, and check for typos in manual entry.

If you see the same barcode appearing multiple times, this indicates duplicate barcodes in the system, which shouldn't happen. Each barcode must be unique, so if you see duplicates, contact your administrator. The system should prevent duplicate barcodes from being created, so this suggests a data integrity issue that needs attention.

If some barcodes aren't found but you're sure they exist, verify the barcodes are correct. Check that containers haven't been deleted, ensure you're using the right barcode format, and verify containers are in the system. Sometimes barcodes from different systems or formats can look similar but aren't actually the same.

## What's Next?

Now that you understand barcode export, you might want to explore [Bulk Export](/docs/guides/bulk-operations/export/) for exporting based on subject lists, check out [Settings](/docs/guides/advanced/settings/) to configure export settings, or review [Search Functionality](/docs/guides/advanced/search/) to learn other ways to find containers.
