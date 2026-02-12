---
title: Specimen Types
description: Manage specimen types and their container type associations
---

Specimen types define what kinds of biological samples you work with in SampleDB. These types appear throughout the system whenever you're registering specimens, importing data, or viewing sample information. Each specimen type can be associated with specific container types that are allowed for that specimen, which helps ensure data quality by preventing inappropriate container assignments.

Understanding specimen types is fundamental to using SampleDB effectively. When you register a specimen, you select its type from the available specimen types. When you import data, specimen types must match exactly what's in your reference data. The system uses specimen types to organize your inventory, generate statistics, and filter exports.

## Understanding What Specimen Types Represent

A specimen type represents a category of biological sample. Common examples include Whole Blood (whole blood samples), Plasma (plasma samples), Serum (serum samples), DNA (DNA extracts), RNA (RNA extracts), and Blood Spot (dried blood spots). Your laboratory might work with many more types depending on your research focus.

Each specimen type serves as a classification that groups similar samples together. This classification helps you organize your inventory, understand what types of samples you have, and filter data when needed. The system tracks how many of each specimen type you have, which helps with inventory management and planning.

## Container Type Associations

Each specimen type can be associated with specific container types that are allowed for storing that specimen. The available container types include Paper (DBS Sheet) for dried blood spots, Cryovial Tube for liquid samples, Micronix Tube for small volume samples, and Static Well for fixed-position containers.

These associations control several important behaviors. They determine which container types can be used when registering specimens of this type—if you try to create a container for a specimen type that doesn't allow that container type, the system will prevent it. They control which container types appear in dropdowns and forms, making it easier to select appropriate containers. And they provide validation during import and data entry, catching mistakes before they become problems.

For example, you might configure Whole Blood to allow only Cryovial Tubes, since whole blood is typically stored in vials. Blood Spots might allow only Papers, since they're stored as dried blood spot sheets. DNA might allow both Micronix Tubes and Cryovial Tubes, giving you flexibility in how you store DNA samples.

## Managing Specimen Types

To view specimen types, navigate to Reference Data and select the Specimen Types tab. You'll see a list of all specimen types in your system, showing names, container type associations, and related information. This list helps you understand what specimen types are available and how they're configured.

Adding a new specimen type is straightforward. Click "Add Specimen Type" or "New" to open the creation form. Enter a name for the specimen type—this should be clear and descriptive, like "Whole Blood" or "Plasma EDTA" to distinguish it from other plasma types. Then select which container types are allowed by checking the boxes for Paper, Cryovial Tube, Micronix Tube, and Static Well as appropriate. You can select multiple types if the specimen can be stored in different ways. Click Save, and the specimen type is immediately available for use.

Editing specimen types allows you to update names (if they're not in use) and modify container type associations. You can add new container types to an existing specimen type, or remove associations if they're no longer needed. However, the system protects existing data—if a container type is in use with a specimen type, you may not be able to remove that association, as doing so would leave existing containers in an invalid state.

## Understanding Container Type Usage

The system tracks which container types are actually being used with each specimen type. Container types that have existing containers cannot be removed from a specimen type's allowed list, as this would break the association for those existing containers. You'll see indicators showing usage status, which helps you understand which associations are active and which can be safely modified.

This protection prevents breaking existing data. If you have Whole Blood specimens stored in Cryovial Tubes, you can't remove Cryovial Tube from the Whole Blood specimen type's allowed container types, because that would make those existing containers invalid. You'd need to first update or remove those containers before you could change the association.

## Deleting Specimen Types

Specimen types cannot be deleted if they have associated specimens or are referenced in existing data. This protection maintains data integrity—if you could delete a specimen type that's in use, you'd leave specimens without valid types, which would break the system.

To delete a specimen type, you must first remove or update all references to it. This might mean updating specimens to use a different type, or removing specimens that use the type. Once all references are removed, you can delete the specimen type. This process ensures that deletion doesn't break existing data.

## Container Type Relationships

For each specimen type, you can see which container types are allowed, which are currently in use, and which can be safely removed. This information helps you understand the current state of your configuration and make informed decisions about updates.

When you update relationships by editing a specimen type, you can check or uncheck container type boxes to add or remove associations. The system will allow adding new container types immediately, but it will prevent removing container types that are in use. If you try to remove an association that would affect existing data, you'll see warnings explaining what would be affected.

## Best Practices for Specimen Types

Effective specimen type management starts with good naming. Use standard, recognized names that your team will understand. Be specific when needed—distinguish "Plasma EDTA" from "Plasma Heparin" if you work with both. Use consistent capitalization and formatting throughout your specimen types. Avoid abbreviations when possible, as full names are clearer and less ambiguous.

For container type associations, set them during creation to establish the correct relationships from the start. Review associations regularly to ensure they still match your workflows, and consider use cases when deciding which container types to allow. Document your decisions about associations, especially if there are specific reasons why certain combinations are or aren't allowed.

Keep your specimen types organized by grouping related types together conceptually, even if the interface shows them in a flat list. Use descriptions if your system supports them to clarify what each type is for. Maintain your list by removing unused types and keeping names current and accurate.

## Common Specimen Type Configurations

Different specimen types typically use different container types based on how they're stored. Whole Blood, Plasma, and Serum are typically stored in Cryovial Tubes, as they're liquid samples that need vial storage. DNA and RNA can be stored in either Micronix Tubes or Cryovial Tubes, depending on volume and your lab's preferences. Blood Spots are stored on Papers, as they're dried blood spot samples. Buffy Coat and Urine are typically stored in Cryovial Tubes.

These are common patterns, but your laboratory might have different needs. The system is flexible enough to accommodate whatever container types make sense for your specimen types and workflows.

## Troubleshooting Specimen Type Issues

If you can't remove a container type association, it's because that container type is in use with this specimen type. Review existing containers using this combination to understand what would be affected. Update or remove those containers first, then you can remove the association.

If you get an error that a specimen type already exists, check the existing list to see if there's a similar name. Specimen type names must be unique, so you might need to use a different name or modify the existing type instead of creating a new one.

If a specimen type doesn't appear in dropdowns, verify it exists in Reference Data and check for typos in the name. The system is case-sensitive, so "Whole Blood" is different from "whole blood". Make sure you're looking in the right place and that the type hasn't been deleted.

## What's Next?

Now that you understand specimen types, you might want to explore [Units](/docs/guides/reference-data/units/) to configure measurement units, check out [Container Management](/docs/guides/workflows/containers/) to see how specimen types relate to containers, or review [Bulk Import](/docs/guides/bulk-operations/import/) to see how specimen types are used in imports.
