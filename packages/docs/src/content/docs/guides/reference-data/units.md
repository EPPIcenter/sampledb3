---
title: Units
description: Configure measurement units for quantities
---

Units are the measurement units used throughout SampleDB when recording quantities. Whether you're tracking volumes, masses, concentrations, or counts, units provide the context that makes quantities meaningful. Configuring units correctly ensures your data is accurate and consistent across your laboratory.

The system uses units in many places: when recording container quantities, when specifying volumes or masses for specimens, when tracking remaining quantities, and in any other context where measurements are recorded. Having the right units configured makes it easy to record data accurately and understand what those quantities represent.

## Understanding Units

Each unit represents a specific way of measuring something. Volume units like Milliliter (mL) and Microliter (µL) measure how much liquid or material you have. Mass units like Milligram (mg) and Gram (g) measure weight. Concentration units like ng/µL or mg/mL measure how much of something is in a given volume. Count units measure discrete items like pieces or spots.

Units are organized into categories that group similar units together. This categorization helps the system organize units logically and makes it easier to find the right unit when you need it. When you're recording a volume, you'll see volume units. When you're recording a mass, you'll see mass units.

## Creating and Managing Units

To view units, navigate to Reference Data and select the Units tab. You'll see a list of all units in your system, organized by category. Each unit shows its name, symbol, and category, making it easy to understand what each unit represents.

Adding a new unit requires a few pieces of information. The name is the full name of the unit, like "Milliliter" or "Microliter". The symbol is the abbreviation or symbol used to represent the unit, like "mL" or "µL". The category groups the unit with similar units—select from volume, mass, concentration, count, or other categories as appropriate.

When creating units, use standard, recognized names and symbols that your team will understand. This consistency makes it easier to use units correctly and reduces confusion. If you need custom units for specific purposes, document them clearly so team members know when to use them.

You can edit units after creation to correct names or symbols, or to change categories if needed. However, be careful when modifying units that are in use, as changes will appear everywhere those units are used. If a unit is being used by existing containers or specimens, consider whether changes are appropriate or if you should create a new unit instead.

Units typically cannot be deleted if they're in use, as this would leave quantities without valid units. If you need to remove a unit, first update all references to use a different unit, then you can delete the unused one.

## Unit Categories

Organizing units into categories helps keep them manageable and makes it easier to find the right unit. Volume units include measurements like Milliliter, Microliter, Liter, and any other volume measurements your lab uses. Mass units include Milligram, Gram, Kilogram, and other weight measurements. Concentration units include measurements like ng/µL, mg/mL, and other concentration expressions. Count units include measurements like pieces, spots, and other discrete counts.

This categorization is useful when selecting units in forms—the system can show only relevant categories, making selection faster and reducing errors. It also helps with organization and makes it easier to understand what units are available for different purposes.

## Best Practices for Unit Management

Effective unit management starts with using standard units that your team recognizes. Use common abbreviations and symbols that match scientific conventions. Document any custom units you create, explaining what they're for and when to use them.

Keep your unit list organized by reviewing it periodically and removing unused units. This keeps the list manageable and makes it easier to find the units you need. Coordinate unit additions with your team, especially for custom units, so everyone understands what's available and when to use different units.

## Common Unit Configurations

Most laboratories need a standard set of units for common measurements. For volumes, you'll typically need Microliter (µL), Milliliter (mL), and possibly Liter (L). For masses, you'll need Milligram (mg), Gram (g), and possibly Kilogram (kg). For concentrations, you might need ng/µL, mg/mL, or other concentration expressions depending on your work. For counts, you might need pieces, spots, or other count units.

These are common patterns, but your laboratory might need additional units for specific purposes. The system is flexible enough to accommodate whatever units your work requires.

## Troubleshooting Unit Issues

If a unit doesn't appear in dropdowns, verify it exists in Reference Data and check for typos. Unit names are case-sensitive, so "mL" is different from "ml". Make sure you're looking in the right category and that the unit hasn't been deleted.

If you can't delete a unit, it's because the unit is in use. Check where it's being used—containers, specimens, or other records might reference it. Update those references to use a different unit, then you can delete the unused one.

## What's Next?

Now that you understand units, you might want to explore [Specimen Types](/guides/reference-data/specimen-types/) to see how units relate to specimen management, check out [Container Management](/guides/workflows/containers/) to see how units are used with containers, or review [Reference Data Overview](/guides/reference-data/overview/) to understand the broader reference data system.
