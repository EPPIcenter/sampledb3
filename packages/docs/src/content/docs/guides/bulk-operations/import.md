---
title: Bulk Import
description: Import subjects and specimens in bulk using CSV files
---

Bulk import is one of the most powerful features in SampleDB, allowing you to add multiple subjects and specimens at once using CSV (Comma-Separated Values) files. Instead of entering data one item at a time, you can prepare a spreadsheet with all your data and import everything in a single operation. This is especially valuable when you're setting up a new study with many subjects, migrating data from another system, or adding large batches of samples that were collected together.

The import process is designed to be safe and informative. The system validates your data before importing anything, shows you exactly what will be created, and provides clear error messages if something needs to be fixed. This validation step prevents problems and helps ensure your data is imported correctly the first time.

## Understanding Import Types

SampleDB supports three different import types, each designed for different scenarios. Choosing the right type for your situation makes the import process smoother and ensures your data is organized correctly.

**Subjects Only** import is the simplest option. It creates subjects for existing studies without adding any specimens. This is useful when you want to set up your subject list first, perhaps to verify enrollment or prepare for specimen collection. The CSV file needs just two columns: the study short code and the subject name. This import type assumes the studies already exist in your system, so make sure your study codes are correct before importing.

**Specimens Only** import adds specimens to subjects that already exist in the system. This is useful when you've already created subjects (either individually or through a previous import) and now want to add their specimens. The system requires that subjects exist before you can add specimens to them, so this import type will fail if it encounters subject names that don't exist. This is actually a safety feature—it prevents accidentally creating duplicate subjects with slightly different names.

**Combined import** (Subjects with Specimens) is the most flexible option and is often the best choice for new data. It creates both subjects and their specimens in one operation, and it automatically creates subjects if they don't already exist. This means you don't need to worry about whether subjects are already in the system—the import handles it for you. This is perfect for importing data from external sources, setting up new studies, or any situation where you're not sure about the current state of your subjects.

## The Import Process

The import process is broken into three clear steps that guide you through the entire operation. The system shows you progress through these steps and won't let you proceed until each step is completed successfully.

### Step 1: Upload and Validate Your Data

The first step is preparing and uploading your CSV file. Start by navigating to the Import section in the sidebar. You'll see options to select your import type and, if you're importing specimens, your container type.

When selecting your import type, think about your data. If you only have subject names and study codes, choose "Subjects Only". If you have specimens but the subjects are already in the system, choose "Specimens Only". If you have both subjects and specimens together, or if you're not sure whether subjects exist, choose "Combined"—it's the most forgiving option.

If you're importing specimens, you'll also need to select a container type. This tells the system what kind of containers to create for your specimens. You can choose "No Containers" if you just want to register specimens without creating containers, or select a specific container type: Micronix Tubes, Cryovial Tubes, Papers, or Static Wells. It's important to note that all specimens in a single import must use the same container type. If you have specimens that need different container types, you'll need to run separate imports for each type.

Once you've selected your import type and container type, the system will show you what columns are required in your CSV file. This is helpful because it tells you exactly what information you need to provide. Before creating your CSV file, consider downloading a template. The template includes the correct column headers and example rows showing the expected format, which makes it much easier to prepare your data correctly.

When you're ready, click "Choose File" or drag and drop your CSV file into the upload area. The system will immediately preview the first five rows of your file, which lets you verify that the columns are being read correctly. Required columns are highlighted, making it easy to see what's needed. Review this preview carefully—if the columns don't look right, there might be an issue with your CSV formatting.

Once your file is uploaded, click "Validate & Continue" to have the system check your data. The validation process is thorough: it checks that all required columns are present, validates that data formats are correct (like dates and positions), checks for missing required values, verifies that study codes exist (for specimen imports), and identifies any collections that are referenced but don't exist yet.

If validation finds any problems, you'll see clear error messages explaining what needs to be fixed. The errors are specific—they'll tell you which row has the problem and what the issue is. Common problems include missing columns, incorrect date formats, invalid position formats, or study codes that don't exist. Fix these issues in your CSV file and upload it again.

### Step 2: Creating Missing Collections

If your CSV file references collections (plates, boxes, or bags) that don't exist in the system yet, you'll see a step where you can create them. This step only appears if collections are needed, so if you're importing subjects only or specimens without containers, you'll skip directly to the import step.

The system shows you a list of all the missing collections it found in your CSV file. For each collection, you'll need to specify where it's stored by selecting a location from the dropdown. Only locations that can contain collections are shown, which prevents you from selecting inappropriate storage locations.

For plates and boxes, you can optionally enter a barcode if the collection has one. This is helpful for tracking and makes it easier to find collections later using barcode scanners.

Once you've assigned locations to all the missing collections, click "Create Collections & Continue". The system will create all the collections, and then the import will proceed automatically. This step ensures that when your specimens are imported and containers are created, they have valid collections to belong to.

### Step 3: Importing Your Data

Once validation passes and collections are created (if needed), the import runs automatically. The system processes each row in your CSV file, creating subjects (if needed), creating specimens, creating containers (if specified), and linking everything together correctly.

The import process shows you progress, and when it completes, you'll see a summary of what was created. The summary tells you how many items were successfully imported, and if there were any errors, it lists them with specific information about what went wrong and which rows had problems.

If some rows failed to import, you can review the error messages, fix the problems in your CSV file, and import again. The system is designed to handle partial success gracefully—rows that succeed are imported, while rows with errors are skipped, so you don't lose your progress if a few rows have issues.

## Understanding CSV Requirements

The columns required in your CSV file depend on what you're importing and what container type you're using. The system is flexible enough to handle different scenarios, but it needs certain information to create records correctly.

For a Subjects Only import, you need just two columns: `study_short_code` and `subject_name`. The study short code must match an existing study in your system, and subject names must be unique within each study.

For Specimens Only or Combined imports without containers, you need `study_short_code`, `subject_name`, and `specimen_type_name`. The `collection_date` is optional but recommended. The specimen type name must match exactly what's in your Reference Data, including capitalization.

When you're importing specimens with containers, the requirements become more specific. For Micronix tubes, you need the collection name (plate name), a unique barcode for each tube, and a position in the plate. The position must be in the correct format: a letter (A-H) followed by two digits (01-12), like "A01" or "B12". For Cryovial tubes, you need the collection name (box name) and a position. Barcodes are optional for cryovial tubes. For Papers, you need the collection name (box or bag name) and a label identifier. For Static Wells, you need the collection name and a position, using the same A01-H12 format as Micronix tubes.

The system provides templates for each scenario, which include the correct column headers and example data showing the expected format. These templates are invaluable for ensuring your CSV file is formatted correctly.

## Common Import Scenarios

Different situations call for different import approaches. If you're setting up a completely new study with subjects and their initial specimens, a Combined import is usually the best choice. You can include all subjects and their specimens in one CSV file, specify the container type if applicable, and import everything in one operation. This creates the complete study structure efficiently.

If you're adding specimens to subjects that already exist—perhaps because you've collected follow-up samples or additional specimen types—a Specimens Only import works well. Make sure your subject names match exactly what's in the system, and the import will add the new specimens to the existing subjects.

For subjects with multiple collection dates (in longitudinal studies), you simply include multiple rows in your CSV file, one for each collection. Each row creates a separate specimen with its own collection date. This allows you to track the complete collection history for each subject over time.

## Position Format Guidelines

Getting position formats right is crucial because incorrect positions make it difficult to locate samples later. For Micronix tubes and Static Wells, positions must use a letter followed by two digits, with the digits zero-padded. "A01" is correct, but "A1" is not. "B12" is correct, but "B012" is not. This format matches standard 96-well plate layouts and ensures compatibility with laboratory equipment and other software.

For Cryovial tubes, the position format depends on your box layout. Some boxes use letter-number combinations like "A5" or "B12", while others use just numbers like "1" or "25". The system accepts whatever format matches your boxes, but consistency within each box is important so positions are meaningful.

## Troubleshooting Import Issues

If your import encounters problems, the error messages are designed to help you fix them quickly. Missing required columns will be clearly identified, and the system will tell you exactly which columns are needed. Invalid study codes will be listed so you can verify them or create the missing studies. Missing collections will be identified in the collections creation step, where you can create them before proceeding.

If you see position format errors, check that you're using the correct format for your container type. For Micronix and Static Wells, ensure positions are in the "A01" format with two-digit columns. For Cryovial tubes, verify that positions match your box layout.

Container barcode errors usually mean a barcode is already in use. Each barcode must be unique across your entire system, so if you're seeing this error, check for duplicates in your CSV file or verify that the barcode isn't already assigned to another container.

Invalid specimen type errors mean the specimen type name in your CSV doesn't match what's in Reference Data. Check the spelling and capitalization—specimen type names are case-sensitive and must match exactly.

## Best Practices for Successful Imports

A few simple practices can make your imports go smoothly. Always test with a small file first—import just a few rows to verify the format is correct before importing hundreds or thousands of rows. Use the provided templates to ensure your column names and formats are correct. Validate before importing large files—the validation step catches problems early and saves time.

Check your study codes before importing to make sure they exist in the system. Use consistent naming for subjects and collections so your data is organized clearly. And keep backups of your CSV files—having the original files makes it easy to re-import if needed or to track what was imported when.

## What's Next?

Now that you understand bulk import, you might want to explore [Bulk Export](/guides/bulk-operations/export/) to learn how to export your data, review the [CSV File Guidelines](/guides/troubleshooting/csv-guidelines/) for detailed formatting requirements, or check [Common Issues](/guides/troubleshooting/common-issues/) if you encounter problems during import.
