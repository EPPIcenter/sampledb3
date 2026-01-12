---
title: Locations (Reference Data)
description: Manage storage locations in Reference Data
---

Locations can be managed in the Reference Data section, providing an alternative interface to the main Locations page. This list-based interface is particularly useful for administrative tasks, bulk location management, and when you prefer working with lists rather than tree views. Both interfaces access the same data, so changes made in one are immediately visible in the other.

The Reference Data interface offers different strengths compared to the main Locations page. While the main page provides a visual tree view that's excellent for navigation and understanding hierarchy, the Reference Data interface provides a list view that's better for administrative tasks, searching, and bulk operations.

## Accessing Locations in Reference Data

Navigate to Reference Data and select the Locations tab to access the list-based location management interface. You'll see a comprehensive list of all locations in your system, showing key information for each location. The interface includes search functionality to help you find specific locations quickly, even in large hierarchies.

## Understanding the Reference Data Interface

The Reference Data interface displays locations in a list format that shows important information at a glance. For each location, you'll see the location name, the full path showing its position in the hierarchy, the storage type if one is assigned, any description that's been added, the parent location, and creation and update dates. This comprehensive view makes it easy to understand location relationships and properties without navigating through a tree.

The list format is particularly useful when you need to see many locations at once or when you're performing administrative tasks that benefit from a flat view. You can sort and filter the list to find what you need, and pagination helps you navigate through large location hierarchies efficiently.

## Managing Locations in Reference Data

Adding locations in the Reference Data interface follows the same process as other reference data types. Click "Add Location" or "New" to open the creation form. You'll need to provide a name for the location, which should be clear and descriptive. Optionally, you can select a parent location to nest this location in the hierarchy, assign a storage type to categorize it, and add a description for additional context. Once you've filled in the information, click Save and the location is created.

Editing locations allows you to modify names, change parent locations (which moves the location in the hierarchy), update storage types, and modify descriptions. Be careful when changing a location's parent, as this moves the location and all its child locations in the hierarchy. This affects all child locations and collections, so make sure the new parent makes sense for the entire subtree.

Deleting locations requires that they have no child locations and contain no collections. This safety check prevents accidental deletion of locations that are in use. If you need to delete a location, first move or delete all child locations and collections, then you can delete the location itself.

## Search and Filtering Capabilities

The Reference Data interface provides powerful search and filtering tools that make it easy to find locations even in large hierarchies. The search function looks through location names and paths, so you can find locations by typing part of their name or any part of their path. This is especially useful when you know a location's name but aren't sure where it sits in the hierarchy.

Pagination helps you navigate through large location lists efficiently, showing a manageable number of locations per page. If your system supports it, you may also have filtering options that let you narrow down locations by storage type, parent location, or other criteria.

## Comparing the Two Interfaces

Both the Reference Data interface and the main Locations page access the same underlying data, so changes made in one are immediately visible in the other. However, each interface has different strengths that make it better suited for certain tasks.

The Reference Data interface excels at administrative tasks. Its list format makes it easy to see many locations at once, search and filter efficiently, and perform bulk operations. If you're adding many locations, updating multiple locations, or need to see comprehensive information about locations, the Reference Data interface is often more efficient.

The main Locations page excels at navigation and visual understanding. Its tree view makes it easy to see hierarchy relationships, navigate through the structure, and understand how locations relate to each other. If you're exploring your storage infrastructure, finding locations by browsing, or need to understand spatial relationships, the main Locations page is often more intuitive.

## Best Practices for Location Management

Effective location management benefits from using the appropriate interface for each task. Use the Reference Data interface for administrative tasks like adding many locations, updating multiple locations, or searching for specific locations. Use the main Locations page for navigation, exploring hierarchy, or understanding spatial relationships.

When making changes, verify them in both interfaces to ensure everything looks correct. The different views can help you catch issues—if something looks wrong in one interface, check it in the other to get a complete picture.

Coordinate location updates with your team, especially when making significant changes to hierarchy or when adding many locations. This coordination prevents conflicts and ensures everyone understands the changes. Document your location hierarchy structure so team members can understand the organization, and so you can maintain consistency as the hierarchy grows.

## What's Next?

Now that you understand location management in Reference Data, you might want to explore [Location Management](/guides/workflows/locations/) to learn about the main locations interface, check out [Storage Types](/guides/reference-data/storage-types/) to understand how storage types relate to locations, or review [Reference Data Overview](/guides/reference-data/overview/) to understand the broader reference data system.
