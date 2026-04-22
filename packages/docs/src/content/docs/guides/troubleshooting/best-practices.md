---
title: Best Practices
description: Recommended workflows and practices for using SampleDB
---

Following these best practices will help you use SampleDB effectively and maintain data quality. These recommendations are based on common workflows and help prevent problems before they occur. Adopting these practices makes your work more efficient and ensures your data remains accurate and well-organized.

## Establishing Naming Conventions

Consistent naming conventions are fundamental to effective data management. When everyone follows the same patterns, data is easier to find, understand, and work with.

### Study Short Codes

Use a consistent format for study short codes—typically all uppercase with 3-6 alphanumeric characters. Make codes memorable by relating them to study names when possible. For example, "NAM15" for a Namibia study from 2015, or "TCC08" for a Trial Control Center study numbered 08. Avoid special characters that might cause issues in CSV files or exports, and document your conventions in a master list that team members can reference.

### Subject Names

Use consistent formats within each study. Sequential numbering like "SUBJ-001", "SUBJ-002" works well and makes it easy to see how many subjects you have. Alternatively, "P001", "P002" or "S-001", "S-002" can work depending on your preferences. Avoid special characters except hyphens and underscores, which are generally safe. Document your naming scheme so team members can follow it consistently.

### Collection Names

Use descriptive names that include study or project identifiers when helpful. Sequential numbering like "PLATE-001", "PLATE-002" makes it easy to see how many collections you have. Include type indicators like "PLATE-001" or "BOX-001" to make it clear what kind of collection it is. Use consistent formats across all collections so they're easy to identify and organize.

### Barcodes

Ensure all barcodes are unique—this is a system requirement that prevents identification problems. Use formats compatible with barcode scanners if you plan to scan barcodes. Follow consistent patterns like "MTX-12345" for Micronix tubes or "CV-001234" for Cryovial tubes. Document your barcode formats so team members can follow them, and verify barcodes don't already exist before using them.

## Managing Study Codes Effectively

Study codes are critical identifiers used throughout the system, so managing them well prevents many problems.

### Creating Studies

Plan your short code before creating the study—think about what makes sense and check that it's not already used. Verify the short code isn't already in use by checking existing studies. Keep a master list of study codes so you can reference them and avoid duplicates. Set the longitudinal flag correctly during creation, as it cannot be changed later.

### Using Study Codes

Use study codes consistently—always use the same short code for a study throughout the system. Double-check study codes in CSV files before importing, as typos cause import failures. Document which codes are used in which contexts to help team members understand your conventions.

## Organizing Containers Effectively

Good container organization makes it easier to find samples and manage inventory.

### Collection Planning

Think about how collections will be organized before creating many of them. Use logical grouping to put related samples together. Consider collection capacity when planning—make sure you have enough space for the samples you need to store. Document your organization scheme so it's clear how collections are structured.

### Position Management

Always use correct position formats for your container types. Double-check positions before saving, as incorrect positions make it difficult to locate samples later. Use visual grid views when available to verify positions are correct. Keep track of which positions are used to avoid conflicts and make it easier to find available positions.

### Barcode Management

Ensure all barcodes are unique across your system. Consider barcoding collections as well as individual containers, as this makes inventory management easier. Document your barcode formats so team members can follow them consistently. Verify barcodes don't already exist before using them to prevent conflicts.

## Designing Location Hierarchies

Good location hierarchy design makes it easier to find samples and understand storage distribution.

### Planning Your Hierarchy

Design your hierarchy structure before creating many locations. Match the structure to your physical layout so it's intuitive. Use consistent naming throughout the hierarchy. Don't create unnecessarily deep hierarchies—most labs find 3-5 levels provide enough detail without being unwieldy.

### Organizing Locations

Use descriptive names that are clear and searchable. Assign storage types to locations to help with categorization and reporting. Keep the hierarchy simple enough to be useful. Document your location organization conventions so team members can understand the structure.

## Data Entry Best Practices

Good data entry practices ensure accuracy and make data more useful.

### Collection Dates

Always record collection dates when available—they're important for tracking and reporting. Use consistent date formats (YYYY-MM-DD) throughout your data entry. Collection dates help you understand timelines and are essential for many exports and reports.

### Container Creation

Create containers when specimens are physically stored to ensure records match reality. Use consistent barcode formats if you're using barcodes. Ensure positions follow the correct format for your container type. Double-check positions before saving to avoid errors.

### Specimen Registration

Use correct specimen types that match your Reference Data exactly. Verify study codes and subject names are correct before registering specimens. Include collection dates when available. Create containers during registration when specimens are already stored to create complete records in one step.

## Import and Export Best Practices

Effective import and export practices save time and prevent errors.

### Preparing Imports

Test with small files first to verify formats are correct before importing large datasets. Use provided templates to ensure column names and formats are correct. Validate before importing large files to catch problems early. Check study codes exist before importing to prevent failures.

### Managing Exports

Use appropriate export configurations for your needs. Review export summaries to verify what was included. Save export files for records, especially if sharing with collaborators. Use filters effectively to get exactly the data you need without overwhelming exports.

## Reference Data Management

Good reference data management ensures your system supports your workflows correctly.

### Adding Reference Data

Plan before adding many items to ensure organization makes sense. Use consistent naming conventions that team members will understand. Add descriptions to document what items are for, especially for items that might not be immediately obvious. Coordinate additions with your team to ensure consistency.

### Maintaining Reference Data

Review reference data periodically to keep it organized and current. Remove unused items to keep lists manageable. Update names and descriptions as needed to keep them accurate. Coordinate changes with your team, especially for frequently used items.

## Quality Control Practices

Regular quality control helps maintain data accuracy and catch problems early.

### Regular Reviews

Review data periodically to verify accuracy and catch errors. Check that locations match where collections are actually stored. Verify container positions are correct by spot-checking physical containers. Review study and subject data for consistency and accuracy.

### Documentation

Document your conventions and workflows so team members can follow them. Keep records of important decisions and changes. Maintain reference materials that help team members use the system correctly. Update documentation as workflows evolve.

## Team Coordination

Good coordination ensures everyone uses the system consistently and effectively.

### Communication

Communicate changes to reference data, especially frequently used items. Share naming conventions and workflows with team members. Coordinate bulk operations to avoid conflicts. Notify team members of significant changes that affect their work.

### Training

Ensure team members understand how to use the system correctly. Share best practices and workflows. Provide access to documentation and training materials. Help team members learn features that can make their work more efficient.

## What's Next?

Now that you understand best practices, you might want to review [Common Issues](/docs/guides/troubleshooting/common-issues/) to see how these practices prevent problems, check [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/) for detailed import requirements, or explore the feature guides to learn more about specific capabilities.
