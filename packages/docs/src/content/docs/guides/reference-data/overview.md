---
title: Reference Data Overview
description: Understanding and managing system-wide reference data
---

Reference data is the foundational configuration data that defines what types of information SampleDB can store and how it's organized. Think of it as the building blocks that everything else is constructed from. When you create a specimen, you select a specimen type that was defined in reference data. When you record a quantity, you use a unit that was configured in reference data. When you assign a location, you're choosing from locations defined in reference data.

This data is typically set up during initial configuration, but it can and should be updated as your laboratory's needs evolve. As you start working with new specimen types, need different units, or expand your storage infrastructure, you'll add to your reference data. Understanding how to manage this data effectively helps you keep your system organized and ensures it supports your laboratory's workflows.

## What Reference Data Includes

Reference data encompasses several categories of foundational information. Specimen Types define the kinds of biological samples you work with—Whole Blood, Plasma, DNA, RNA, Blood Spot, and any other types your laboratory uses. These types determine what options appear when you're registering specimens and help organize your sample inventory.

Units are measurement units used throughout the system when recording quantities. These include volume units like Milliliter (mL) and Microliter (µL), mass units like Milligram (mg) and Gram (g), concentration units, count units, and any other measurement types your work requires.

Storage Types represent the types of storage equipment in your laboratory—-80°C Freezer, -20°C Freezer, 4°C Refrigerator, Room Temperature Storage, Liquid Nitrogen storage, and any other storage conditions you use. These types help categorize locations and can be used for filtering and reporting.

Locations are your storage locations organized in a hierarchical structure. These represent your physical storage infrastructure—buildings, rooms, freezers, shelves, and any other organizational units that help you track where samples are stored.

Strains are bacterial or viral strains you work with, which are particularly important for control batches and certain types of research. Tags are labels you can use to categorize items—perhaps marking containers as "Priority", "QC", or "Reanalysis" to help organize your work.

Additional reference data types include Reagents (reagent types you use), Cell Lines (cell line identifiers), Plasmids (plasmid identifiers), and Standards (standard reference materials). These may or may not be relevant depending on your laboratory's specific work.

## Accessing Reference Data Management

Navigate to Reference Data in the sidebar to access the management interface. The interface organizes different types of reference data into tabs, making it easy to find what you need. You'll see tabs for Specimen Types, Units, Storage Types, Locations, Strains, Tags, and any other reference data types your system supports.

Each tab shows a list of items of that type, displaying names, descriptions, related information, and creation dates. You can search and filter these lists to find specific items, and clicking on an item takes you to its detail page where you can view full information and make edits.

## When to Update Reference Data

You'll need to update reference data in several situations. When you start working with new specimen types that aren't in the system yet, you'll need to add them. When you need new units of measurement—perhaps for a new assay or analysis method—you'll add those. When you expand your storage infrastructure with new freezers or storage types, you'll add those as well.

You might also need to modify existing reference data. If you discover errors in names or descriptions, you'll want to correct them. If you need to update relationships—for example, changing which container types a specimen type can use—you'll edit those associations. If storage type descriptions need updating or locations need reorganization, you'll make those changes.

Most reference data can be updated at any time, which gives you flexibility to adapt as your needs change. However, be careful when modifying data that's already in use, as changes can affect existing records. For example, if you change a specimen type's name, that change will appear everywhere that specimen type is used. If you delete a unit that's being used, the system will prevent deletion to protect data integrity.

## Managing Reference Data Items

Viewing reference data is straightforward—each tab shows a list of items with their key information. You can browse these lists, search for specific items, and click on items to see full details. The lists show names or identifiers, descriptions when applicable, related information (like how many items use a particular reference data item), and creation and update dates.

Adding new items follows a consistent pattern across all reference data types. Navigate to the appropriate tab, click "Add" or "New [Type]", and you'll see a form asking for the required information. Fill in the fields—typically a name is required, and descriptions are often optional but recommended. Save the item, and it immediately becomes available for use throughout the system.

Editing items is similarly consistent. Find the item in the list, click "Edit", modify the fields you need to change, and save. The system will prevent changes that would break existing data—for example, you typically can't delete a specimen type that's being used by existing specimens, as that would leave those specimens in an invalid state.

Deleting items requires that nothing is using them. If an item is referenced by existing data, the system will prevent deletion and tell you what's using it. You'll need to remove or update all references before you can delete the item. This protection prevents accidental data loss and maintains data integrity.

## Understanding Reference Data Relationships

Some reference data items have important relationships with each other. Specimen Types can be associated with allowed Container Types, which controls which container types can be used for each specimen type. For example, you might allow Whole Blood to be stored in Cryovial Tubes but not in Papers, while Blood Spots would use Papers but not Cryovial Tubes. These relationships can be updated in the Specimen Types tab, and they help ensure data quality by preventing inappropriate container assignments.

Locations can have Storage Types assigned to them, which helps categorize locations and makes filtering and reporting easier. When you assign a storage type to a location, you're categorizing that location, which can be useful for finding all -80°C freezers or all room temperature storage areas.

These relationships create a network of connections that help the system understand how different pieces of data relate to each other. Understanding these relationships helps you configure reference data effectively and ensures your system supports your workflows correctly.

## Best Practices for Reference Data Management

Effective reference data management starts with planning. Before adding many items, think about your needs and how you want to organize things. Consider naming conventions—will you use abbreviations or full names? Will you include prefixes or suffixes? Consistent naming makes reference data easier to use and understand.

Use descriptions to document what items are for, especially for items that might not be immediately obvious. A good description helps team members understand when to use a particular specimen type, unit, or other reference data item. This documentation becomes more valuable as your team grows and as time passes.

Review reference data regularly to keep it organized. Periodically check for unused items that can be cleaned up, verify that names are still accurate, and ensure descriptions are still relevant. This maintenance helps keep your system organized and makes it easier for new team members to understand your reference data.

Coordinate reference data changes with your team, especially for items that are used frequently. If you're changing a specimen type name or adding new units, let team members know so they can adjust their workflows. This coordination prevents confusion and ensures everyone is using the updated reference data correctly.

## What's Next?

Now that you understand reference data, you might want to explore specific types: [Specimen Types](/docs/guides/reference-data/specimen-types/) to manage your sample types, [Units](/docs/guides/reference-data/units/) to configure measurement units, [Storage Types](/docs/guides/reference-data/storage-types/) to define storage equipment, or [Locations](/docs/guides/reference-data/locations-ref/) to manage your storage hierarchy.
