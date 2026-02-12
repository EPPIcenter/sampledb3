---
title: Other Reference Data
description: Manage strains, tags, reagents, cell lines, plasmids, and standards
---

SampleDB supports several additional types of reference data for specialized use cases. These types—strains, tags, reagents, cell lines, plasmids, and standards—may or may not be relevant depending on your laboratory's specific work, but they're available when you need them. They're managed similarly to other reference data types, following the same patterns for adding, editing, and deleting items.

Understanding these additional reference data types helps you take full advantage of SampleDB's capabilities. Even if you don't use all of them immediately, knowing they're available means you can configure them when your needs evolve.

## Managing Strains

Strains represent bacterial or viral strains used in your work. They're particularly important for blood control definitions, where you specify which strains are included in each control and in what proportions. Strains can also be used for specimen tracking when strain information is relevant to your samples.

To manage strains, navigate to Reference Data and select the Strains tab. You'll see a list of all strains in your system. Each strain has a name (like "E. coli K12" or "Influenza A") and an optional description that provides additional details about the strain.

Strains are used primarily in blood control definitions, where you specify the strain composition of each control. When creating a control definition, you select which strains are included and specify what percentage of each strain makes up the control. This composition tracking is essential for quality control and ensures controls are prepared correctly.

## Managing Tags

Tags are labels you can use to categorize and organize items throughout SampleDB. They're flexible tools that help you mark containers, specimens, or other items with labels that have meaning for your workflow. Tags might represent quality control status ("QC", "Reanalysis"), priority levels ("Priority", "Rush"), or any other categorization that helps you organize your work.

To manage tags, navigate to Reference Data and select the Tags tab. You'll see a list of all tags in your system. Each tag has a name and an optional description that explains what the tag is for and when to use it.

Tags are particularly useful for filtering in exports, where you can include only containers or specimens that have specific tags. This makes it easy to export subsets of your data based on your categorization. Tags can also help organize containers, mark items for quality control, or indicate special handling requirements.

## Managing Reagents

Reagents represent reagent types used in your laboratory. They're useful for tracking reagent usage, managing reagent inventory, and specifying reagent sources when registering specimens. If your work involves reagents as sample sources or if you need to track reagent usage, configuring reagents in reference data enables these capabilities.

To manage reagents, navigate to Reference Data and select the Reagents tab. You'll see a list of all reagents in your system. Each reagent has a name that identifies the reagent type and an optional description with additional details.

Reagents can be used as source types when registering specimens, allowing you to track specimens that come from reagents rather than subjects or control batches. This is useful when reagents are part of your sample workflow and you need to track them in the system.

## Managing Cell Lines

Cell lines represent cell line identifiers used in your work. They're useful for cell culture tracking, specifying cell line sources when registering specimens, and documenting research that involves cell lines. If your laboratory works with cell cultures, configuring cell lines enables proper tracking and documentation.

To manage cell lines, navigate to Reference Data and select the Cell Lines tab. You'll see a list of all cell lines in your system. Each cell line has a name that identifies it and an optional description with additional details.

Cell lines can be used as source types when registering specimens, allowing you to track specimens that come from cell lines. This is useful for research workflows that involve cell culture and need to maintain proper documentation of cell line usage.

## Managing Plasmids

Plasmids represent plasmid identifiers used in molecular biology work. They're useful for plasmid tracking, specifying plasmid sources when registering specimens, and documenting molecular biology workflows. If your laboratory works with plasmids, configuring them in reference data enables proper tracking.

To manage plasmids, navigate to Reference Data and select the Plasmids tab. You'll see a list of all plasmids in your system. Each plasmid has a name that identifies it and an optional description with additional details.

Plasmids can be used as source types when registering specimens, allowing you to track specimens that come from plasmids. This is useful for molecular biology workflows that involve plasmid work and need to maintain proper documentation.

## Managing Standards

Standards represent standard reference materials used in your laboratory. They're useful for quality control, calibration, and specifying standard sources when registering specimens. If your work involves standard reference materials, configuring standards enables proper tracking and documentation.

To manage standards, navigate to Reference Data and select the Standards tab. You'll see a list of all standards in your system. Each standard has a name that identifies it and an optional description with additional details.

Standards can be used as source types when registering specimens, allowing you to track specimens that come from standards. This is useful for quality control workflows and calibration procedures that need to maintain proper documentation.

## Common Management Patterns

All these reference data types follow similar management patterns. Adding items is straightforward: navigate to the appropriate tab, click "Add" or "New", enter a name and optional description, and save. The item immediately becomes available for use throughout the system.

Editing items follows the same pattern: find the item in the list, click "Edit", modify the fields you need to change, and save. Changes are reflected immediately wherever the item is used.

Deleting items requires that nothing is using them. If an item is referenced by existing data, the system will prevent deletion and tell you what's using it. You'll need to remove or update all references before you can delete the item. This protection maintains data integrity and prevents accidental data loss.

## Best Practices for Additional Reference Data

Effective management of these additional reference data types starts with using standard identifiers when possible. Use recognized names or identifiers that your team will understand, and be consistent with naming patterns. Include descriptions to add context, especially for items that might not be immediately obvious, and document your naming conventions so team members can follow them.

Keep your reference data organized by reviewing it periodically and cleaning up unused items. Check for existing items before adding new ones to avoid duplicates, and coordinate updates with your team to ensure consistency. Maintain accuracy by keeping reference data current and correcting errors promptly.

## What's Next?

Now that you understand these additional reference data types, you might want to explore [Reference Data Overview](/docs/guides/reference-data/overview/) to understand the broader reference data system, check out [Blood Controls](/docs/guides/features/blood-controls/) to see how strains are used in control definitions, or review [Bulk Export](/docs/guides/bulk-operations/export/) to see how tags can be used in exports.
