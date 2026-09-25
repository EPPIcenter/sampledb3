---
title: Application Settings
description: Configure appearance, export presets, scanner layouts, and admin defaults
---

The page title and sidebar label are **Application Settings**. Open it from the sidebar, or press **Ctrl+Shift+K** / **Cmd+Shift+K** and run **Go to Application Settings**.

The left column lists categories and sections. What you see depends on your role. Members see appearance, pagination, about, export configurations, and scanner configurations. Administrators also see container defaults, container type units, password requirements, session settings, and table view configurations.

Changes in a section save when you complete that section's action. There is no page-wide Save.

## Application Settings

**Appearance.** Choose **Light**, **Dark**, **Sepia**, **Ocean**, **Warm dark**, **High contrast**, **Forest**, or **Rose**. The choice is stored in the browser and applied on every load. You can also change the theme from the theme control in the bottom-right floating cluster.

**Pagination.** How many rows list pages show.

**About.** Web and API build identifiers for this deployment.

**Container Defaults** (admin). Default quantity used when creating a container of each type. Default units are set under **Container Type Units**.

**Container Type Units** (admin). Allowed units per container type, and the default unit for that type.

## Security Settings (admin)

**Password Requirements.** Minimum length and related rules for new passwords.

**Session Settings.** How long a signed-in session lasts.

## Data Management

### Export Configurations

Used by **Multi-Study Export**, **Micronix Barcode Export**, and the study export modal. Collection table views use **Table View Configurations** instead.

Two tabs:

- **Shared Configurations.** Visible to everyone. Administrators click **+ Add Shared Configuration**.
- **My Configurations.** Visible only to you. Click **+ Add Personal Configuration**.

Each configuration has a name and a column list. **Set as Default** marks one configuration as the default for that tab. **Edit** and **Delete** change or remove a row. If you delete the default and other configurations remain, the first remaining row becomes the default. Deleting asks for confirmation.

The create/edit form submit button is **Add** on **Shared Configurations**, **Create** on **My Configurations**, and **Save** when you are editing.

### Table View Configurations (admin)

Presets for columns on plate, box, bag, and sheet collection tables. One preset can be default. A table CSV download uses the columns currently shown, not an export configuration.

New installs receive a **Default** preset during setup.

### Scanner Configurations

Named layouts for plate-scanner CSV files (column names, header rows, how the destination plate is inferred). The same configurations are used for container move and qPCR plate upload. See [Validate a plate scan](/docs/guides/features/plate-scan-validation/) and [Container movement](/docs/guides/bulk-operations/container-movement/).
