---
title: Location Management
description: Organize your storage infrastructure with hierarchical locations
---

Locations represent your physical storage infrastructure—the freezers, rooms, buildings, and other places where your collections are actually stored. SampleDB uses a hierarchical location system that mirrors your laboratory's physical organization, making it easy to track where samples are stored and to find them when you need them.

The Locations page and related storage pages (location detail, collection detail, container detail, and move wizards) use a consistent "modern precision lab" visual theme aligned with the rest of the app; behavior is unchanged.

The location hierarchy works like a tree, with parent locations containing child locations, creating a structure that matches how your lab is actually organized. This might be Building → Room → Freezer → Shelf, or Freezer → Rack → Shelf → Drawer, or any structure that makes sense for your physical layout. The flexibility of this system means you can organize locations in whatever way matches your laboratory's actual storage setup.

## Understanding How Location Hierarchies Work

Location hierarchies create a logical structure that helps you organize and find your samples. At the top level, you have root locations—these might be buildings, major freezers, rooms, or other top-level storage units depending on how your lab is organized. Under each root location, you can nest child locations to create as many levels as you need.

For example, you might organize locations like this: a Building contains multiple Rooms, each Room contains Freezers, each Freezer contains Racks, each Rack contains Shelves, and each Shelf contains Drawers. Or you might have a simpler structure where Freezers contain Shelves directly. The system is flexible enough to accommodate whatever organization makes sense for your lab.

This hierarchy serves several important purposes. It helps you organize storage logically, matching your physical layout. It allows you to track exactly where collections are located, down to the specific shelf or drawer. It enables location-based reporting, so you can see how samples are distributed across your storage. And it makes navigation efficient, as you can drill down through the hierarchy to find what you need.

## The Components of Your Location System

Root locations are your top-level storage units. These are created during the initial setup process or later through the Locations page or Admin → Location Management. They represent the highest level of your storage organization—whether that's buildings, major freezers, or rooms depends on your lab's structure.

Child locations are nested under parent locations, creating the hierarchy. You can nest locations as deeply as needed—rooms under buildings, freezers under rooms, shelves under freezers, drawers under shelves, and so on. There's no limit to how many levels you can create, though most labs find that three to five levels provide enough detail without becoming unwieldy.

Each location can have a storage type assigned to it, which helps categorize the location. Storage types like "-80°C Freezer", "-20°C Freezer", "4°C Refrigerator", "Room Temperature", or "Liquid Nitrogen" provide context about what kind of storage equipment the location represents. These storage types are useful for filtering, reporting, and understanding your storage infrastructure at a glance.

## Creating Your Location Hierarchy

Only administrators can create or modify locations. You can create locations from two places: the main **Locations** page (Browse Data → Locations) or **Admin → Location Management**. Both use the same tree-based interface and access the same data.

### Using the Locations Page

The Locations page shows a tree view of all your locations, making it easy to see the hierarchy and understand how locations relate to each other. When there are no locations yet, administrators see a "Create first location" button to add the initial root location.

To add a root location, click **Add Root** in the tree header. To add a child location, hover over a parent in the tree and click the plus (+) icon that appears.

When you open the location creation form, you'll need to provide a name for the location. This should be something clear and descriptive—"Freezer A" is better than just "A", and "Shelf 1" is clearer than "1". For root locations, you must select a storage type (e.g. "-80°C Freezer"); child locations inherit the storage type from their parent. You can optionally add a description and choose whether the location can contain collections (plates, boxes, bags).

Once you've filled in the form, click **Create** and the location will be added to your hierarchy. The tree view will update to show the new location in its proper place.

### Using Admin → Location Management

Administrators can use the dedicated Location Management page for creating and managing locations. Navigate to **Admin → Location Management** (or use the command palette: **Create Location**). This page provides the same tree-based interface as the main Locations page, with a "Back to Admin Dashboard" link for quick return. It is particularly useful when performing administrative tasks from the Admin section.

## Navigating the Location Tree

The Locations page provides an interactive tree view that makes it easy to explore your storage hierarchy. You can click arrows or location names to expand and collapse sections of the tree, allowing you to focus on the areas you're interested in. The tree preserves your expansion state as you work, so if you expand a freezer to see its shelves, that expansion will remain when you navigate away and come back.

The page includes a search box that lets you quickly find locations by name or path. This is especially useful when you have a large hierarchy and need to jump to a specific location quickly. Type part of a location name, and the system will show matching locations that you can click to navigate directly.

When you click on a location in the tree, it becomes selected and is highlighted. The details panel on the right (or below on smaller screens) shows comprehensive information about that location, including its full path through the hierarchy, storage type, description, and what collections are stored there.

## Understanding Location Details

When you select a location, you'll see detailed information that helps you understand what's stored there and how the location fits into your hierarchy. The location information section shows the name and the full path (like "Building A → Room 101 → Freezer A → Shelf 1"), which gives you context about where this location sits in your overall structure. You'll see the storage type if one is assigned, any description you've added, and when the location was created and last updated.

The location capabilities section shows whether collections can be stored at this location. This is an important setting because not all locations are appropriate for storing collections—you might have intermediate locations like "Room" that contain other locations but don't directly hold collections. Only locations that can contain collections will appear in dropdowns when you're assigning collections to locations.

The location contents section shows what's actually stored at this location. You'll see lists of Micronix Plates, Cryovial Boxes, Boxes, and Bags that are stored here. This gives you a complete picture of what physical collections are at this location, which is essential when you need to find samples.

Location statistics provide summary information about the location and its contents. You'll see the total number of collections stored there, the total number of containers in those collections, a breakdown by collection type, and hierarchy statistics showing how many child locations exist and how many total descendant locations are in the subtree below this location.

## Assigning Collections to Locations

When you create a collection, you'll need to assign it to a location. This happens during collection creation, where you select the location from a dropdown. The system only shows locations that can contain collections, which prevents you from accidentally assigning collections to intermediate locations that don't make physical sense.

If you need to move a collection to a different location later—perhaps because you've reorganized storage or moved collections physically—you can do so from the collection detail page. Click "Edit" or "Change Location", select the new location, and save. The system will update the location assignment, and the collection will appear in the new location's contents list.

For moving multiple collections at once, the system provides bulk movement tools that are covered in the [Collection Move](/docs/guides/features/collection-move/) guide. These tools are especially useful when you're reorganizing storage on a larger scale.

## Searching for Locations

The Locations page includes search functionality that helps you find locations quickly, even in large hierarchies. Simply type in the search box, and the system will find locations whose names or paths match your search term. The results show matching locations, and you can click any result to navigate directly to that location in the tree.

In location **pickers** (e.g. wherever you open the “Select location” dialog), you can type a **path** with more than one level, separated by `>` or `/`, to narrow the tree to that branch. A two-part path (e.g. `Bldg > 5`) shows that branch and **everything under it**; add another segment to filter deeper (e.g. `Bldg > 5 > A` matches *A* as a name prefix on the next level). A segment that is **only digits** matches a whole “word” in the name—`5` matches `Shelf 5` or a location named `5`, but not `15`. A single search term without those separators still searches names, full paths, and descriptions as before.

This search is particularly helpful when you know a location's name but aren't sure where it sits in the hierarchy, or when you're working with a very large location structure and need to jump to a specific place quickly.

## Designing Your Location Hierarchy

Good location hierarchy design starts with understanding your physical layout and organizing locations to match it. The structure should be logical and intuitive—if someone needs to find a sample, the location path should guide them to the right place in the real world.

Common patterns include building-based organization, where you start with buildings, then rooms, then freezers, then shelves. This works well for labs with multiple buildings or large facilities. Freezer-based organization starts with freezers as the top level, then racks, shelves, and drawers underneath. This works well when freezers are the primary organizational unit. Room-based organization starts with rooms, then cabinets, drawers, and shelves, which works well for smaller facilities or when rooms are the main organizational element.

Whatever pattern you choose, use consistent naming throughout. Clear, descriptive names make locations easy to find and understand. Include numbers or letters when helpful—"Freezer A" and "Freezer B" are clearer than just "Freezer 1" and "Freezer 2" if that's how you refer to them in the lab.

Don't create unnecessarily deep hierarchies. While the system supports unlimited nesting, most labs find that three to five levels provide enough detail. Too many levels make navigation cumbersome, while too few might not provide enough granularity for finding samples.

Assign storage types to locations to help with categorization and reporting. This makes it easier to filter locations by type, generate reports about specific storage conditions, and understand your storage infrastructure at a glance.

## Making Changes to Locations

You can edit location details after creation, which is useful for correcting names, updating descriptions, or adjusting storage types. Navigate to the location you want to modify, click "Edit Location", and you can change the name, parent location, storage type, or description.

Be careful when changing a location's parent, as this moves the location in the hierarchy. This change affects all child locations and collections under the moved location, so the entire subtree moves with it. This is powerful for reorganizing your hierarchy, but make sure the new parent makes sense for all the child locations and collections.

Locations can only be deleted if they have no child locations and contain no collections. This safety check prevents accidental deletion of locations that are in use. If you need to delete a location, first move or delete all child locations and collections, then you can delete the location itself. Remember that deletion is permanent, so make sure you really want to remove the location before confirming.

## Using Location Statistics

The Locations page provides statistics that help you understand your storage infrastructure. You'll see the total number of locations in your system, how many are root locations (top-level), how collections are distributed across locations, and container counts per location. These statistics give you insights into your storage utilization and help you identify locations that might be getting full or areas that need attention.

## Tips for Effective Location Management

Effective location management starts with planning. Before creating many locations, think about your hierarchy structure and how it matches your physical layout. A little planning upfront saves time later and ensures your organization makes sense.

Use descriptive names that are clear and searchable. "Freezer A" is better than "FA", and "Room 101" is clearer than "R101" if that's not how you actually refer to it. The goal is to make locations easy to find and understand for everyone who uses the system.

Assign storage types consistently to help with organization and reporting. This categorization becomes more valuable as your location hierarchy grows, making it easier to filter and understand your storage infrastructure.

Keep your hierarchy simple enough to be useful. While you can create very deep hierarchies, most labs find that moderate depth (three to five levels) provides the right balance between detail and usability.

Document your location organization conventions so team members can follow them consistently. This is especially important in team environments where multiple people might be adding locations over time.

## What's Next?

Now that you understand location management, you might want to learn about [Container Management](/docs/guides/workflows/containers/) to see how containers relate to locations, explore [Collection Move](/docs/guides/features/collection-move/) to learn how to move collections between locations, or visit Admin → Location Management for the administrative location interface.
