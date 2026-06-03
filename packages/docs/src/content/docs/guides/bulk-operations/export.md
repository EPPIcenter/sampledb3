---
title: Bulk Export
description: Export containers and data using multi-study export
---

The bulk export feature allows you to export container data for multiple studies at once, based on a list of subjects. This is incredibly useful when you need to prepare samples for analysis, generate reports for collaborators, transfer data to other systems, or create datasets for statistical analysis. Instead of manually gathering information about containers, the system does the work for you by finding all matching containers based on your criteria.

The export process is designed around a simple concept: you provide a list of subjects (and optionally collection dates), and the system finds all containers associated with those subjects that match your criteria. You can then apply various filters to narrow down exactly what you want, choose your export format, and download a file with all the relevant container data.

## How Multi-Study Export Works

The export process starts with a CSV file containing study codes and subject names. This file tells the system which subjects you're interested in. The system then searches through all containers in your database, finding ones that belong to those subjects. You can apply filters to narrow the results—perhaps you only want certain specimen types, or containers from a specific date range. Once you've configured everything, the system generates an export file with all the matching container data.

This approach is powerful because it works across multiple studies simultaneously. You can export containers from different studies in a single operation, which is much more efficient than exporting each study separately. The system handles all the complexity of matching subjects, finding containers, applying filters, and formatting the output.

## Preparing Your Subject List

Your CSV file needs to include at minimum the study short code and subject name for each subject you want to export. These two columns are required: `study_short_code` identifies which study the subject belongs to, and `subject_name` identifies the specific subject. The system uses these to find matching containers.

You can also include optional columns that provide more specific matching criteria. The `collection_date` column lets you specify an exact collection date for each subject. If you include this, the system will only export containers from specimens collected on that specific date (or within your date tolerance, which we'll discuss shortly).

Alternatively, you can use `date_from` and `date_to` columns to specify a date range for each subject. This is useful when you want containers from specimens collected within a certain time period. For example, you might want all containers from specimens collected in January 2024, regardless of the exact date.

The simplest approach is to just include study codes and subject names, which will export all containers for those subjects regardless of collection date. This is useful when you want a complete export of everything related to those subjects.

## The Export Workflow

The export process guides you through several steps, each giving you control over what gets exported and how it's formatted.

### Uploading Your Subject List

Start by navigating to the Export section in the sidebar. Click "Choose File" and select your CSV file containing the subject list. The system will immediately parse the file and show you how many rows were successfully read. This quick feedback lets you know if there are any obvious formatting issues before you proceed further.

### Validating Study Codes

As soon as your file is uploaded, the system automatically validates all the study codes in your CSV. This validation checks whether each study code exists in your system and shows you the results. For valid studies, you'll see the study title and lead person, which helps you verify you're using the correct codes. For invalid codes, you'll see a clear list of codes that don't exist.

This validation is important because the export can't proceed with invalid study codes. If your CSV contains study codes that don't exist, you'll need to fix them before you can export. This prevents you from getting empty or incorrect results and helps ensure your export includes data from the studies you actually want.

### Configuring Date Tolerance

Date tolerance is a powerful feature that provides flexibility when matching collection dates. In real-world scenarios, collection dates in your CSV might not match exactly with the collection dates recorded in SampleDB. This can happen due to processing delays, data entry timing differences, or other practical considerations.

Date tolerance allows you to specify how many days of difference are acceptable. With zero days tolerance (the default), the system requires an exact date match. With two days tolerance, a subject with collection_date "2024-01-15" in your CSV will match containers from specimens collected on January 13, 14, 15, 16, or 17. This flexibility helps you find containers even when dates don't match exactly, which is common in laboratory workflows.

The tolerance applies to all subjects in your CSV that have collection dates specified. If a subject doesn't have a collection date in your CSV, the tolerance doesn't apply—the system will export all containers for that subject regardless of collection date.

### Applying Filters to Narrow Results

Once your subject list is uploaded and validated, you can apply various filters to control exactly what gets exported. These filters work together, so containers must match all selected filters to be included in the export.

**Specimen Types** filtering lets you include only certain types of specimens. You can select one or more specimen types from a checklist, and only containers with those specimen types will be exported. If you leave all specimen types unchecked, the export includes all types. This is useful when you only want to export specific sample types, like only DNA samples or only plasma samples.

**Container Types** filtering works similarly—you can select which container types to include (Micronix Tubes, Cryovial Tubes, Papers, Static Wells). If you leave all types checked, everything is included. This helps when you only want certain container formats, perhaps because your analysis workflow requires specific container types.

**Collection Date Range** filtering lets you specify a date range that applies to all subjects. Containers from specimens collected within this date range will be included, regardless of what dates are in your CSV file. This is useful when you want to export containers from a specific time period across all your subjects.

**Created Date Range** filtering works similarly but filters by when containers were created in the system, not when specimens were collected. This can be useful for tracking when data was entered or for exporting only recently added containers.

**Tags** filtering lets you include only containers that have been tagged with specific labels. If you use tags to categorize containers (like "QC", "Priority", or "Reanalysis"), you can filter exports to include only containers that have **all** selected tags (the same AND rule as Statistics).

All these filters are optional—you can use none, some, or all of them depending on your needs. The system shows you a count of how many containers match your current filter settings, which updates automatically as you change filters. This helps you verify that your filters are working as expected before you export.

### Selecting Export Configuration

Export configurations determine which columns appear in your exported file. The default configuration includes all available columns, which gives you comprehensive data but can result in large files. Custom configurations let you create predefined column sets for specific purposes.

For example, you might create a "Minimal Export" configuration that includes only essential identifiers and basic information, perfect for quick lookups. Or you might create an "Analysis-Ready" configuration that includes all the columns needed for statistical analysis, formatted appropriately for analysis software.

Configurations are managed in the Settings section, where you can create, edit, and set default configurations. Once created, they appear in the export configuration dropdown, making it easy to use the same column sets consistently across exports.

### Choosing Your Export Format

Container export supports three download formats. Pick the format that matches how you will use the file — not every workflow needs Excel.

**CSV download** is the default and works well when you will open the file in R, Python, or other scripts; load it into a LIMS or analysis pipeline; or share a lightweight text file with collaborators. CSV uses plain quoted cell values (no Excel formula wrappers). Identifier columns such as barcodes are plain strings in the file. If Excel strips leading zeros when you open CSV, use **XLSX download** instead of expecting CSV to preserve text formatting.

**XLSX download** is the right choice for Excel-first workflows. Excel workbook export marks identifier and code columns as **text cells**, so leading zeros and long barcodes are preserved when you open the file in Excel. Use XLSX when lab staff will work entirely in Excel and need reliable text formatting without CSV workarounds.

**JSON download** provides structured data for programmatic import into another system. It is less convenient for manual review in a spreadsheet.

On the Export page, Study export modal, and Barcode export, you can override CSV delimiter, UTF-8 BOM, and line ending before download. Defaults (comma, BOM on, CRLF) match SampleDB's canonical **CSV download** conventions described in [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/).

> **Upgrade note:** Older SampleDB container export CSV files used Excel formula wrappers (`="..."`) on some columns. Current releases export plain strings. See [Release Notes](/docs/guides/troubleshooting/release-notes/) if you are updating integrations or scripts.

### Previewing What Will Be Exported

Before you actually export, the system shows you how many containers match your current criteria. This count updates automatically as you change filters, giving you real-time feedback about how your filters are affecting the results. This preview helps you verify that your filters are working correctly and that you'll get the data you expect.

If the count seems too high or too low, you can adjust your filters before exporting. This saves time compared to exporting and then realizing you need different filters.

### Generating and Downloading Your Export

When you're ready, click the "Export" button to generate your file. The system processes all subjects, finds matching containers, applies your filters, formats the data according to your selected configuration, and generates the export file. The file downloads automatically to your computer, ready to use.

The export process can take a moment if you're exporting large amounts of data, but the system shows progress so you know it's working. Once complete, you'll have a file with all the container data you requested, formatted and ready for your analysis or reporting needs.

## Understanding Export Results

After the export completes, you'll see a summary that provides insights into what was exported. The summary shows the total number of containers exported, which gives you a quick sense of the dataset size.

For each study included in your export, you'll see a breakdown showing the study code, title, and lead person. This helps you verify that data from the correct studies was included. You'll see how many containers were exported for each study, which helps you understand the distribution of your data.

The summary also shows which subjects had results exported and how many containers each subject contributed. This is useful for verifying that you got data for all the subjects you expected. Subjects with no results are listed separately, which helps you identify if there were any subjects that didn't have matching containers (perhaps because they don't have specimens yet, or because your filters excluded all their containers).

If any study codes in your CSV were invalid, they'll be listed separately so you know which codes need to be corrected for future exports.

## Common Export Scenarios

Different situations call for different export approaches. If you want to export all specimens for a list of subjects regardless of collection date, simply include study codes and subject names in your CSV without any date columns. Don't apply date filters, and the export will include everything.

If you need containers from a specific collection date, include the `collection_date` column in your CSV with the exact date for each subject. Set date tolerance to zero for exact matches, or increase it if you want some flexibility. This approach works well when you're preparing samples from a specific collection event.

For containers from a date range, you can either include `date_from` and `date_to` columns in your CSV for per-subject date ranges, or use the Collection Date Range filter to apply the same range to all subjects. The filter approach is simpler when you want the same date range for everyone, while per-subject ranges in the CSV give you more flexibility.

If you only want specific specimen types, use the Specimen Types filter to select only the types you need. This is common when you're preparing samples for a specific analysis that only uses certain specimen types.

## Using Filters Effectively

Filters work together using AND logic, meaning containers must match all selected filters to be included. If you select "Whole Blood" as a specimen type AND "Cryovial Tube" as a container type AND a date range, only containers that are Whole Blood specimens in Cryovial Tubes collected within that date range will be exported.

This means you can be very specific about what you want. You might filter to only DNA samples in Micronix tubes collected in the last month, or only Plasma samples in any container type from a specific study. The combination of filters gives you precise control over your export.

If you find your filters are too restrictive and you're not getting the results you want, you can clear all filters with one click and start fresh. The system remembers your subject list, so you can experiment with different filter combinations without re-uploading your CSV.

## Export Configurations Explained

Export configurations are powerful tools for standardizing your exports. Instead of manually selecting columns each time, you can create configurations that define exactly which columns to include. This ensures consistency across exports and saves time when you regularly export data for the same purposes.

The default configuration includes all available columns, which is comprehensive but can be overwhelming if you only need a few pieces of information. Custom configurations let you create focused exports with just the columns you need. For example, a "Barcode List" configuration might include only study, subject, specimen type, barcode, and position—perfect for generating scanning lists for tubes. For **paper** containers, use **`sublabel`** and **`sheet_name`** export columns instead of stuffing spot identifiers into **`barcode`**.

Configurations are managed in Settings, where you can create new ones, edit existing ones, set defaults, and delete ones you no longer need. Once you've set up configurations for your common export needs, using them becomes second nature.

Collection detail pages (micronix plates, cryovial boxes, boxes, bags, and sheets) have a **table view** with a "Columns" dropdown. Table view uses **table view configurations** (separate from export configurations), managed in Settings under Data Management → Table View Configurations. The table shows only columns defined in the selected preset. **Collection table snapshot export** downloads the current view—the same columns and rows you see on screen—as a client-side CSV snapshot. It does not run a server-side container query and does not use **Export configuration** presets. Snapshot CSV uses the same **CSV download** wire conventions (UTF-8 BOM and CRLF by default) as server exports, but only **Container export** workflows (this page, Study export modal, Barcode export) offer XLSX and JSON formats and export-configuration column presets.

## Troubleshooting Export Issues

If your export doesn't find any containers, there are several possible causes. The subjects might not exist in the system, or they might not have any containers yet. Your filters might be too restrictive, excluding all containers. Or the date tolerance might be too strict if you're using collection dates.

The export summary helps diagnose these issues. Check which subjects had no results—if it's all subjects, there might be a problem with how subjects are identified. If it's only some subjects, those specific subjects might not have containers. Review your filters to see if they're excluding everything, and check the date tolerance if you're using collection dates.

If you see invalid study codes, fix them in your CSV and re-upload. The system won't export anything until all study codes are valid, which prevents incomplete or incorrect exports.

If your export file seems empty or missing data, check the export summary to see what was actually exported. The summary breaks down results by study and subject, which helps you understand what data was included and what might be missing.

## Best Practices for Exports

A few practices can make your exports more effective. Always validate study codes first by checking the validation results before exporting. This catches problems early and ensures you're exporting from the correct studies.

Use appropriate date tolerance to balance flexibility with precision. Too much tolerance might include containers you don't want, while too little might miss containers you do want. Consider your data entry practices when setting tolerance—if collection dates are always entered on the collection day, zero tolerance might work. If there are processing delays, a day or two of tolerance might be helpful.

Test with small lists first to verify your export format and filters work as expected. Once you're confident, you can export larger datasets. Review the export summary after each export to understand what was included and verify it matches your expectations.

Save your export configurations for common use cases so you don't have to recreate them each time. And keep copies of your export files for records, especially if you're sharing them with collaborators or using them for important analyses.

## What's Next?

Now that you understand bulk export, you might want to explore [Bulk Import](/docs/guides/bulk-operations/import/) to learn how to bring data into the system, check out [Settings](/docs/guides/advanced/settings/) to configure export settings, or review the [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/) to ensure your subject list CSV is formatted correctly.
