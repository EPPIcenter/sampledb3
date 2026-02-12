---
title: Storage Types
description: Define types of storage equipment
---

Storage types represent the types of storage equipment in your laboratory. These types help categorize locations, enable filtering and reporting, and provide context about storage conditions. Defining storage types accurately helps you organize your storage infrastructure and understand how samples are distributed across different storage conditions.

When you assign a storage type to a location, you're categorizing that location based on the equipment it represents. This categorization is useful for finding all -80°C freezers, understanding storage capacity by temperature, or generating reports about specific storage conditions. Storage types provide a way to organize and understand your physical storage infrastructure.

## Understanding Storage Types

Storage types represent different storage equipment and conditions. Common examples include -80°C Freezer for ultra-low temperature storage, -20°C Freezer for standard freezer storage, 4°C Refrigerator for cold storage, Room Temperature for ambient storage, and Liquid Nitrogen for cryogenic storage. Your laboratory might use additional types depending on your equipment and storage needs.

Each storage type can have a name that identifies the equipment type and an optional description that provides additional context. The name should be clear and descriptive—"-80°C Freezer" is better than just "Freezer" because it specifies the temperature. Descriptions can include additional details about the storage type, such as typical uses or special considerations.

## Creating and Managing Storage Types

To view storage types, navigate to Reference Data and select the Storage Types tab. You'll see a list of all storage types in your system, showing names and descriptions. This list helps you understand what storage types are available and how they're configured.

Adding a new storage type is simple. Click "Add Storage Type" or "New" to open the creation form. Enter a name for the storage type—this should be clear and descriptive, like "-80°C Freezer" or "Liquid Nitrogen Storage". Optionally add a description that provides additional context about the storage type, such as typical uses or special handling requirements. Click Save, and the storage type is immediately available for assignment to locations.

You can edit storage types after creation to update names or descriptions. This is useful for correcting information or adding details as you learn more about your storage infrastructure. Changes to storage types will appear wherever those types are assigned, so updates are reflected throughout the system.

Storage types typically cannot be deleted if they're assigned to locations, as this would leave those locations without valid storage types. If you need to remove a storage type, first update all locations that use it to use a different type, then you can delete the unused one.

## Using Storage Types with Locations

Storage types are assigned to locations to categorize them. When you create or edit a location, you can select a storage type from the available options. This assignment helps organize your location hierarchy and makes it easier to find locations with specific storage conditions.

The relationship between locations and storage types is flexible—you can assign storage types to locations at any level of your hierarchy. A root location might have a storage type, or child locations might have their own types. This flexibility allows you to organize storage types in whatever way makes sense for your infrastructure.

## Best Practices for Storage Types

Effective storage type management starts with clear naming. Use descriptive names that indicate the storage condition, like "-80°C Freezer" rather than just "Freezer". Include temperature information when relevant, as this helps distinguish between similar equipment types.

Use descriptions to provide additional context when helpful. If a storage type has special handling requirements or typical uses, document them in the description. This information helps team members understand when and how to use different storage types.

Keep your storage types organized by reviewing them periodically and removing unused types. This keeps the list manageable and makes it easier to find the types you need. Coordinate storage type additions with your team, especially if you're adding types for new equipment, so everyone understands what's available.

## Common Storage Type Configurations

Most laboratories need storage types for their common equipment. Ultra-low temperature storage typically requires a "-80°C Freezer" type. Standard freezer storage needs a "-20°C Freezer" type. Cold storage requires a "4°C Refrigerator" type. Ambient storage needs a "Room Temperature" type. And cryogenic storage might need a "Liquid Nitrogen" type.

These are common patterns, but your laboratory might have additional storage types for specialized equipment or conditions. The system is flexible enough to accommodate whatever storage types your infrastructure requires.

## Troubleshooting Storage Type Issues

If a storage type doesn't appear in location assignment dropdowns, verify it exists in Reference Data and check for typos. Storage type names are case-sensitive, so make sure you're using the exact name. Ensure the storage type hasn't been deleted.

If you can't delete a storage type, it's because the type is assigned to locations. Check which locations use it, update those locations to use a different type, then you can delete the unused one.

## What's Next?

Now that you understand storage types, you might want to explore [Locations](/docs/guides/reference-data/locations-ref/) to see how storage types are used with locations, check out [Location Management](/docs/guides/workflows/locations/) to understand location hierarchies, or review [Reference Data Overview](/docs/guides/reference-data/overview/) to understand the broader reference data system.
