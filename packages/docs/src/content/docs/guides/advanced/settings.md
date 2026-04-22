---
title: Settings
description: Configure application settings, export configurations, and table view configurations
---

The Settings page allows you to configure various aspects of SampleDB, including export configurations, table view configurations (for collection table columns), default settings, and system preferences. The Settings UI uses a consistent "modern precision lab" visual theme aligned with the rest of the app; behavior is unchanged. Understanding how to configure these settings helps you customize the system to match your laboratory's workflows and ensures exports and other operations work the way you need them to.

Export configurations are particularly important, as they determine which columns appear in exported data files. Creating and managing these configurations ensures your exports include the right information and are formatted appropriately for your needs.

## Accessing Settings

Navigate to Settings in the sidebar to access the configuration interface. You can also use the command palette (press Ctrl+K or Cmd+K) and search for "Settings" to jump directly to the settings page.

## Understanding Export Configurations

Export configurations define which columns appear in exported data files. When you export data—whether through bulk export, barcode export, or other export methods—you can select a configuration that determines what information is included. Export configurations are used only for the Export page, Barcode Export, and Export modal. Collection table view (plates, boxes, bags, sheets) uses **table view configurations** instead; see "Other Settings" below.

The Settings page shows a list of all export configurations in your system, displays which configuration is set as the default (if any), and shows configuration details that help you understand what each configuration includes. Changes to export configurations—including shared configurations—are saved as soon as you add, edit, delete, or set a default; there is no separate "save" step.

## Creating Export Configurations

Creating a new export configuration starts with clicking "New Configuration" or "Add Configuration". You'll need to provide a name for the configuration, which should be descriptive enough that you understand what it's for. Examples might be "Standard Report", "Minimal Export", or "Analysis-Ready".

Optionally, you can add a description that explains what the configuration is for and when to use it. This documentation helps team members understand which configuration to select for different purposes.

You can check "Is Default" to make this configuration the default selection in export interfaces. Only one configuration can be default at a time, so setting a new default removes default status from the previous one.

Next, you'll select which columns to include by checking boxes for the columns you want. Uncheck columns you don't need. The system shows all available columns, and you can create configurations with any combination. Once you've selected your columns, click Save and the configuration is immediately available for use in exports.

## Editing and Managing Configurations

You can edit configurations after creation to update names, descriptions, default status, or column selections. Find the configuration in the list, click "Edit", make your changes, and save. Updates are immediately available in export interfaces.

Setting a default configuration makes it the automatic selection in export interfaces, which saves time if you usually export with the same column set. To set a default, edit a configuration, check "Is Default", and save. The previous default automatically loses its default status.

Deleting configurations is straightforward, but you cannot delete the default configuration. If you want to delete the current default, first set another configuration as default, then you can delete the one you no longer need.

## Common Configuration Use Cases

Different workflows call for different export configurations. A standard report configuration might include commonly needed columns like study information, subject information, specimen type, collection date, and container details. This provides comprehensive information for most reporting needs.

A minimal export configuration might include just essential identifiers, barcodes, and positions. This creates lightweight exports that are perfect for quick lookups or when you only need basic information.

An analysis-ready configuration might include all relevant data columns, formatted appropriately for analysis tools, and include metadata that's useful for statistical analysis. This ensures exports are ready to use in analysis software without additional formatting.

## Other Settings

**Table view configurations** (Data Management, admin only) define presets for which columns appear in the collection table view on plate, box, bag, and sheet detail pages. One preset can be set as the default. Table CSV download exports the current view columns. This is separate from export configurations, which apply only to the Export page and barcode export. New installations get a default "Default" preset at setup. For existing databases upgraded before this feature, run the seed script once (from repo root: `DATABASE_PATH=/path/to/sampledb.sqlite bun --filter @sampledb/api run seed-table-view-config`) to add the default table view configuration; the script is idempotent and does nothing if configs already exist.

**Appearance** (Application Settings) lets you choose the application theme: Light, Dark, Sepia, Ocean, Warm dark, High contrast, Forest (dark green), or Rose (warm pink). Your choice is saved and applied on every load. You can also change the theme from the theme control in the bottom-right floating action cluster (hover to expand, then click the theme button to open the dropdown).

Depending on your system configuration, you may see additional settings beyond export and table view configurations. System preferences might include default date formats, display options, or notification settings. User preferences might include interface preferences, display options, or personal settings that customize your experience.

These additional settings vary by system configuration, so check what's available in your instance and configure them according to your preferences and needs.

## Best Practices for Settings Management

Effective settings management starts with creating standard configurations that your team uses regularly. Set up common configurations for your typical export needs, and name them clearly so team members understand what each one is for. Use descriptions to explain configurations, especially if their purposes aren't immediately obvious from the name.

Set sensible defaults that match your most common use case, which saves time by making the right configuration automatically selected. Review configurations periodically and update them as needs change, keeping them current and useful.

For configuration organization, group configurations by purpose to make it easier to find what you need. Keep configurations current by updating them as your needs evolve, and coordinate with your team to ensure everyone understands available configurations and when to use them. Document changes when configurations are modified, noting when and why changes were made.

## Troubleshooting Settings Issues

If a configuration doesn't appear in export dropdowns, refresh the export page to ensure it picks up new configurations. Verify that the configuration was saved correctly, check that the configuration name is correct, and ensure the configuration hasn't been deleted.

If you can't delete a configuration, it's likely because it's set as the default. Set another configuration as default first, then you can delete the one you no longer need. The system prevents deleting the default to ensure there's always a default available.

## What's Next?

Now that you understand settings, you might want to explore [Bulk Export](/docs/guides/bulk-operations/export/) to see how export configurations are used, check out [Barcode Export](/docs/guides/advanced/barcode-export/) to see configurations in barcode exports, or review [Reference Data](/docs/guides/reference-data/overview/) to understand other system configuration options.
