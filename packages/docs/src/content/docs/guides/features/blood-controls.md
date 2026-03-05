---
title: Blood Controls
description: Manage control definitions, batches, and inventory
---

Blood controls are reference samples used for quality control, calibration, and validation in laboratory work. SampleDB provides comprehensive tools for managing control definitions, creating control batches, and tracking inventory. This system helps you maintain quality control samples efficiently, whether you're working with dried blood spots, cryovial controls, or other control materials.

The Blood Controls pages use the same "modern precision lab" visual theme as the rest of the app (dashboard, studies, storage); behavior is unchanged.

The blood controls system is built around **compositions**, **definitions**, and **batches**. A **composition** is a parasite strain mix (which strains and their percentages). A **control definition** is a composition plus a target density—so one composition can have several definitions (one per density). A **control batch** is a specific production of a definition, with actual specimens. The UI is organized by composition first: you see compositions (grouped by strain signature), then within each composition you see density variants (definitions) and their batches.

## Understanding Control Definitions

Control definitions are templates that describe types of controls you work with. Think of a definition as a recipe or specification for a control type. It defines what strains are included, in what proportions, and what the target properties should be. Once you've created a definition, you can use it to create multiple batches, each following that specification.

Each control definition has a name that identifies the control type, like "Mixed Strain Control" or "Negative Control". The name should be descriptive enough that anyone in your lab understands what the control is for. You can add an optional description that provides more details about the control's purpose, how it's used, or any special considerations.

The definition specifies which strains are part of the control. Strains are bacterial or viral strains that must exist in your Reference Data before you can use them in a definition. You select the strains that should be included, and then you specify the composition—what percentage of each strain makes up the control.

The strain composition is important because it defines the exact makeup of the control. Each strain gets a percentage, and all percentages must add up to exactly 100%. For example, you might have a control that's 50% Strain A, 30% Strain B, and 20% Strain C. The system enforces that the total equals 100%, which ensures your composition is complete and accurate.

You can also specify a target density, which is the target cell density or concentration for the control. This is useful for quality control tracking, as you can compare actual batch densities to the target to ensure consistency across productions.

## Compositions and the Composition List

On Blood Controls, the **Compositions** tab shows a list of compositions—each row is a unique strain mix (same strain IDs and percentages). For each composition you see how many density variants (definitions) exist, total batches, and inventory. Click **View** or the row to open the **composition detail** page.

On the composition detail page you see the biological content (strain bar and percentages) and a **Density variants** section. Each variant is one control definition (same composition, different target density) with its batches and inventory. From here you can open a definition, **Create batch** (manual, for that density), or **Add batches from CSV** (multi-file, multi-density from CSV).

## Creating and Managing Control Definitions

To create a control definition, navigate to Blood Controls in the sidebar and make sure you're on the Compositions tab (or use **New Control Definition** from the main Blood Controls entry). Click "New Control Definition" or "Create Definition" to open the creation form.

The form is organized in a lab-oriented order: **composition first**, then **target densities**, then **definition names** (when creating more than one).

1. **Strain composition** — Define the biological content first. Add one or more parasite strains from your Reference Data and set the percentage each represents in the control. The total must equal exactly 100%. Use "Add strain" to add more strains; the form validates the total as you go.

2. **Target densities** — Same composition, one or more target concentrations. Choose a **concentration unit** (e.g. p/µL) once for the list. Then enter one or more density values (e.g. 100, 500, 1000). Each value is one definition. Use "Add density" to add another row; remove a row with the × button. Single density is simply one row; multiple densities create multiple definitions in one step.

3. **Definition names** — When you have two or more densities, a **Definitions to create** section appears with a suggested name per density (e.g. 100_StrainA, 500_StrainA). You can edit any name before creating. For a single density, the optional **Definition name** field and "Auto-generate name" appear instead; you can leave name auto-generated or enter one.

Once you've filled in the information, click "Create" to save the definition (or definitions). They will immediately be available for use when creating control batches. When creating from the **batch wizard** (via "Create new definition" on the Batch Info step), the same form is used; after creating multiple definitions at once, the first is selected so you can continue the wizard, and the others remain in the list for later batches.

You can edit control definitions after creation, which is useful for updating descriptions or adjusting compositions. However, it's important to understand that changing a definition doesn't affect existing batches—those batches retain the composition they were created with. New batches created after you edit the definition will use the updated version.

## Understanding Control Batches

A control batch is a specific production of a control type. While the definition describes what the control should be, the batch represents an actual set of control samples that were produced together. Each batch has specimens (the actual control samples), and the system tracks inventory for each batch.

When you create a batch, you specify which definition it's based on. This links the batch to the definition and ensures it follows the correct specification. The batch gets a name (like "BATCH-001" or "2024-Q1-Control") that identifies this specific production. You can record a production date that indicates when the batch was actually created, which is useful for tracking batch age and planning when to use controls.

The batch accumulates specimens as you add them, and the system automatically tracks inventory. Inventory is broken out by container type: spots (paper-based controls), micronix tubes, cryovial tubes, and static wells. The total inventory gives you a complete picture of how much control material you have available from each batch.

## Creating Control Batches

You can create batches in two ways: **manual** (one batch for one density) or **from CSV** (one or more CSV files, with optional density column and one collection per file).

### Manual: one batch per definition

Navigate to Blood Controls, open the **composition** or the **control definition** you want, then click **Create batch**. The wizard starts with that definition. It will suggest a batch name based on the definition and today's date. You can edit the name and production date, then add specimens (manually or via a single CSV). For CSV, you assign one collection per file: collection name defaults to the filename (without `.csv`); you **check existing** by name and type (box, bag, micronix plate, cryovial box). If a collection with that name and type exists, it is used; otherwise you choose a location and the system will create the collection on submit. For **paper (DBS)** containers, you must provide a **sheet name** in the Containers step (required; no default). After configuring specimens and containers, review and submit to create one batch.

### From CSV: multiple batches and multiple files

From a **composition** detail page, click **Add batches from CSV**. On the first step (Upload CSV) you can set the **production date** (it defaults to today); the same date is used for all batches created in that run. You can also change it on the Review step before submitting. You upload one or more CSV files. Each file corresponds to **one collection**: the default collection name is the filename (without `.csv`) and you can change it. **Container type** is inferred from the CSV template when possible: a **sheet_name** column indicates paper (DBS); a **position** column (without sheet_name) indicates cryovial tubes (you can change to micronix in the Containers step if needed). In the Containers step, when the type was inferred from the CSV, it is shown with “(inferred from CSV)” next to the dropdown; you can override it if needed. For each file you **check existing** (by name and type): if found, that collection is used; if not, you choose a location and the collection will be created on submit. For **paper (DBS)** files, you must provide a sheet name for every row. Either add a **sheet_name** column to your CSV (one value per row; multiple rows can share the same sheet name) or enter a single sheet name in the Containers step to apply to all rows in that file. If your CSV has a **sheet_name** column, the Containers step infers sheet names from it: with one value it shows "Sheet name: … (from CSV)" (read-only); with multiple values it shows "Sheet names from CSV: …". The editable sheet name field appears only when there is no sheet_name column, so you can type a single name for the whole file. All sheets go into the file's collection (box or bag). You cannot proceed to Review until every paper row has a sheet name (from the column or the per-file field).

CSV files can include an optional **density** column. If present, rows are grouped by density and **one batch is created per density** (same composition). **Each density must already have a control definition** for that composition—create definitions first from Blood Controls (e.g. from the composition detail page). If a density in your CSV has no matching definition, the Review step shows an error and you cannot submit until you create that definition. When multiple definitions match the same numeric density (e.g. same 5000 but different units), the Review step shows a **definition selector** so you choose which definition to use for each row. The Review table shows density **with unit** (e.g. "5000 µL") when the definition has a unit. If there is no density column, all rows in a file form a single batch (you must have a single density in context). The wizard shows a **preview** of batches to be created: file, collection, density (with unit when applicable), definition, and specimen count. After you confirm, the system uses your chosen definitions (no automatic creation), resolves or creates collections per file, and creates each batch with its specimens in the correct collection.

### Collection resolution (name + type)

When you enter a collection name and type (box, bag, micronix plate, cryovial box), the system **resolves** whether that collection already exists. If it finds a match, it shows the existing collection and its location and uses it. If not, it shows **Create new** and you must pick a **location**; on submit the collection is created and used. This applies to both manual and CSV flows so you never create duplicate collections by name and type.

### Batch wizard steps

The batch creation wizard includes: Batch Info (name, date), Specimen Types, CSV Upload (with per-file collection name and resolve), Containers (manual entries; for paper/DBS, a required sheet name per file or per sheet), and Review. For the **Add batches from CSV** flow from a composition, you start at CSV Upload, set collection name and type per file and resolve or plan creation, then complete the Containers step (including sheet name for any paper files), then go to Review to see the preview and submit.

You can also add specimens later through the batch detail page or use bulk import to add many specimens at once.

## Adding Specimens to Batches

There are several ways to add specimens to control batches. During batch creation, some workflows allow you to add specimens immediately. From the batch detail page, you can click "Add Specimen" to register individual control specimens. Or you can use the bulk import feature, specifying "Control" as the source type and referencing the control batch name.

When you register a specimen with a control batch as the source, the specimen becomes part of that batch's inventory. The system automatically updates the batch's inventory counts, so you always know how many spots, micronix tubes, cryovial tubes, static wells, or other units are available.

## Using Controls in Your Work

When you register specimens in SampleDB, you can specify a control batch as the source. This is useful when you're working with control samples in your assays or experiments. In the specimen registration form, select "Control" as the source type, then select the control batch. Complete the rest of the specimen details (specimen type, collection date, container if applicable), and the specimen will be created and associated with the control batch.

This association helps you track which control batches are being used, how much inventory remains, and when batches might need to be replenished. The system maintains the connection between control batches and the specimens created from them, giving you a complete picture of control usage.

## Filtering and Finding Controls

As your control inventory grows, being able to find specific definitions or batches becomes important. The Blood Controls interface provides filtering tools to help you locate what you need.

On the **Compositions** tab, the list is grouped by composition (strain signature). You can filter by search term, strains (Contains or Exact), and target density range. On the **Batches** tab you can filter batches by search term, production date range, strains, and density range.

For batches, you can filter by search term (searching batch names and definition names), by production date range (useful for finding batches from specific time periods), by strains (based on the definition's strains, with the same Contains/Exact toggle), and by density range. This makes it easy to find batches that meet specific criteria, whether you're looking for recent batches, batches with certain strain compositions, or batches within a density range.

## Tracking Inventory

Inventory tracking is automatic and comprehensive. The system counts spots (paper-based controls), micronix tubes, cryovial tubes, and static wells separately, and provides a total inventory count for each batch. These counts update automatically as you add or use specimens, so you always have current information.

The batch detail page shows inventory counts prominently, making it easy to see how much control material is available. Definition pages show aggregate inventory across all batches of that definition, giving you a high-level view of total available inventory for each control type.

This inventory tracking helps you plan when to produce new batches, understand usage patterns, and ensure you always have adequate control materials available for your work.

## Best Practices for Control Management

Effective control management starts with clear definitions. Use descriptive names that indicate the control's purpose, and document strain compositions clearly. Setting target densities when applicable helps with quality control tracking and ensures consistency across batches.

For batch management, use consistent naming conventions that make it easy to identify batches. Recording production dates helps you track batch age and plan usage. Assigning locations to batches makes it easier to find them when needed.

Regular inventory reviews help you stay on top of control availability. Monitor which batches are being used, track inventory levels, and plan new batch production before you run out. The inventory counts make it easy to see when batches are getting low.

## Troubleshooting Control Issues

If you can't find a composition or definition when creating a batch, open the Compositions tab and use the filters (search, strains, density). Use **View** on a composition to see its density variants and create a batch from there. For CSV-based batch creation, start from the composition detail page with **Add batches from CSV**.

If inventory counts don't match your expectations, verify that all specimens are properly associated with the batch. Check that specimens haven't been deleted, and review the batch detail page to see the complete list of specimens. The inventory is calculated from associated specimens, so if counts are wrong, there might be a specimen association issue.

If you're having trouble with strain composition (the system won't let you save because percentages don't equal 100%), check that all strains are included and that percentages are entered correctly. The system requires the total to equal exactly 100%, so even small rounding differences can cause issues. Make sure you're entering percentages that sum correctly.

## What's Next?

Now that you understand blood controls, you might want to explore [Derivations](/docs/guides/features/derivations/) to see how controls can be used in sample processing, learn about [Bulk Import](/docs/guides/bulk-operations/import/) to add control specimens efficiently, or check out [Reference Data](/docs/guides/reference-data/overview/) to manage strains and other biological data.
