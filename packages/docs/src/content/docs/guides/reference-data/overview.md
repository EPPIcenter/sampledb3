---
title: Reference data
description: Specimen types, tags, storage types, strains, and units
---

Reference data is system-wide configuration: the lists you pick from when you register specimens, record quantities, tag containers, or assign storage types to locations.

The Reference Data page has five tabs: **Specimen Types**, **Tags**, **Storage Types**, **Strains**, and **Units**. Each tab is a table. Click **Edit** on a row to change it in a modal. There are no separate detail pages. Click **Add New** to create a row. The modal title matches the tab, for example **Add Units**.

Locations are not a tab here. Manage them under **Browse Data → Locations**. See [Locations](/docs/guides/workflows/locations/).

## What each tab is for

- **Specimen Types.** Sample categories such as Whole Blood or Plasma. Control which container types are allowed. Import names must match exactly, including capitalization.
- **Units.** Quantity units: symbol, name, and category (Volume, Mass, Count, Concentration, or Other).
- **Storage Types.** Equipment categories assigned to locations, such as -80°C Freezer.
- **Strains.** Parasite strains used in blood control compositions.
- **Tags.** Labels on containers only, not specimens. Used to filter exports and statistics.

## Change items that are in use

You can add items at any time. A rename appears everywhere that item is used. The system blocks deletion, and some edits, when existing records still reference the item. It tells you what is using it. Update or remove those records first.

Specimen types can list allowed container types. You cannot remove a container type that already has containers for that specimen type. Storage types on locations are assigned on the Locations page, not here.

For type-specific fields and constraints, see [Specimen types](/docs/guides/reference-data/specimen-types/), [Units](/docs/guides/reference-data/units/), [Storage types](/docs/guides/reference-data/storage-types/), and [Strains and tags](/docs/guides/reference-data/other/).
