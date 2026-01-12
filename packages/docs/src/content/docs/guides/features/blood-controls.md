---
title: Blood Controls
description: Manage control definitions, batches, and inventory
---

Blood controls are reference samples used for quality control, calibration, and validation in laboratory work. SampleDB provides comprehensive tools for managing control definitions, creating control batches, and tracking inventory. This system helps you maintain quality control samples efficiently, whether you're working with dried blood spots, cryovial controls, or other control materials.

The blood controls system is built around two main concepts: definitions and batches. A control definition describes what a type of control is—its composition, target properties, and intended use. A control batch is a specific production of that control type, with actual specimens that you can use in your work. This separation allows you to define control types once and then create multiple batches as needed.

## Understanding Control Definitions

Control definitions are templates that describe types of controls you work with. Think of a definition as a recipe or specification for a control type. It defines what strains are included, in what proportions, and what the target properties should be. Once you've created a definition, you can use it to create multiple batches, each following that specification.

Each control definition has a name that identifies the control type, like "Mixed Strain Control" or "Negative Control". The name should be descriptive enough that anyone in your lab understands what the control is for. You can add an optional description that provides more details about the control's purpose, how it's used, or any special considerations.

The definition specifies which strains are part of the control. Strains are bacterial or viral strains that must exist in your Reference Data before you can use them in a definition. You select the strains that should be included, and then you specify the composition—what percentage of each strain makes up the control.

The strain composition is important because it defines the exact makeup of the control. Each strain gets a percentage, and all percentages must add up to exactly 100%. For example, you might have a control that's 50% Strain A, 30% Strain B, and 20% Strain C. The system enforces that the total equals 100%, which ensures your composition is complete and accurate.

You can also specify a target density, which is the target cell density or concentration for the control. This is useful for quality control tracking, as you can compare actual batch densities to the target to ensure consistency across productions.

## Creating and Managing Control Definitions

To create a control definition, navigate to Blood Controls in the sidebar and make sure you're on the Definitions tab. Click "New Control Definition" or "Create Definition" to open the creation form.

Start by entering a name for your control definition. This should be unique and descriptive. Then add an optional description if you want to provide additional context about the control's purpose or use.

Next, select the strains that should be part of this control. You'll see a list of all strains available in your Reference Data. Select the ones you need, and then for each selected strain, specify what percentage it should represent in the control. The system helps you track the total percentage as you add strains, and it will prevent you from saving until the total equals exactly 100%.

If you're working with controls that have target densities, enter that value. This becomes part of the definition and will be used when creating batches from this definition.

Once you've filled in all the information, click "Create" to save the definition. It will immediately be available for use when creating control batches.

You can edit control definitions after creation, which is useful for updating descriptions or adjusting compositions. However, it's important to understand that changing a definition doesn't affect existing batches—those batches retain the composition they were created with. New batches created after you edit the definition will use the updated version.

## Understanding Control Batches

A control batch is a specific production of a control type. While the definition describes what the control should be, the batch represents an actual set of control samples that were produced together. Each batch has specimens (the actual control samples), and the system tracks inventory for each batch.

When you create a batch, you specify which definition it's based on. This links the batch to the definition and ensures it follows the correct specification. The batch gets a name (like "BATCH-001" or "2024-Q1-Control") that identifies this specific production. You can record a production date that indicates when the batch was actually created, which is useful for tracking batch age and planning when to use controls.

The batch accumulates specimens as you add them, and the system automatically tracks inventory. For paper-based controls, it counts spots. For tube-based controls, it counts tubes. The total inventory gives you a complete picture of how much control material you have available from each batch.

## Creating Control Batches

To create a control batch, navigate to the Blood Controls section and switch to the Batches tab. Click "New Batch" or "Create Batch" to start the process.

You'll need to provide a name for the batch, which should be a unique identifier. Many labs use sequential numbering like "BATCH-001", "BATCH-002", or include dates like "2024-Q1-Control". Select the control definition this batch is based on from a dropdown of available definitions. Optionally, you can specify a production date and a storage location.

Once you've created the batch, you can start adding specimens to it. You can add specimens individually through the batch detail page, or use bulk import to add many specimens at once. Each specimen you add to the batch contributes to the batch's inventory count.

## Adding Specimens to Batches

There are several ways to add specimens to control batches. During batch creation, some workflows allow you to add specimens immediately. From the batch detail page, you can click "Add Specimen" to register individual control specimens. Or you can use the bulk import feature, specifying "Control" as the source type and referencing the control batch name.

When you register a specimen with a control batch as the source, the specimen becomes part of that batch's inventory. The system automatically updates the batch's inventory counts, so you always know how many spots, tubes, or other units are available.

## Using Controls in Your Work

When you register specimens in SampleDB, you can specify a control batch as the source. This is useful when you're working with control samples in your assays or experiments. In the specimen registration form, select "Control" as the source type, then select the control batch. Complete the rest of the specimen details (specimen type, collection date, container if applicable), and the specimen will be created and associated with the control batch.

This association helps you track which control batches are being used, how much inventory remains, and when batches might need to be replenished. The system maintains the connection between control batches and the specimens created from them, giving you a complete picture of control usage.

## Filtering and Finding Controls

As your control inventory grows, being able to find specific definitions or batches becomes important. The Blood Controls interface provides filtering tools to help you locate what you need.

For control definitions, you can filter by search term (which searches names and descriptions), by strains (showing only definitions that include certain strains), and by target density range (if you're looking for controls with specific density targets). These filters help you narrow down long lists to find the definitions you need.

For batches, you can filter by search term (searching batch names and definition names), by production date range (useful for finding batches from specific time periods), by strains (based on the definition's strains), and by density range. This makes it easy to find batches that meet specific criteria, whether you're looking for recent batches, batches with certain strain compositions, or batches within a density range.

## Tracking Inventory

Inventory tracking is automatic and comprehensive. The system counts spots (for paper-based controls), tubes (for tube-based controls), and provides a total inventory count for each batch. These counts update automatically as you add or use specimens, so you always have current information.

The batch detail page shows inventory counts prominently, making it easy to see how much control material is available. Definition pages show aggregate inventory across all batches of that definition, giving you a high-level view of total available inventory for each control type.

This inventory tracking helps you plan when to produce new batches, understand usage patterns, and ensure you always have adequate control materials available for your work.

## Best Practices for Control Management

Effective control management starts with clear definitions. Use descriptive names that indicate the control's purpose, and document strain compositions clearly. Setting target densities when applicable helps with quality control tracking and ensures consistency across batches.

For batch management, use consistent naming conventions that make it easy to identify batches. Recording production dates helps you track batch age and plan usage. Assigning locations to batches makes it easier to find them when needed.

Regular inventory reviews help you stay on top of control availability. Monitor which batches are being used, track inventory levels, and plan new batch production before you run out. The inventory counts make it easy to see when batches are getting low.

## Troubleshooting Control Issues

If you can't find a control definition when creating a batch, verify that the definition exists in the definitions list. Check the spelling of the definition name, and make sure you're looking in the correct tab (Definitions versus Batches).

If inventory counts don't match your expectations, verify that all specimens are properly associated with the batch. Check that specimens haven't been deleted, and review the batch detail page to see the complete list of specimens. The inventory is calculated from associated specimens, so if counts are wrong, there might be a specimen association issue.

If you're having trouble with strain composition (the system won't let you save because percentages don't equal 100%), check that all strains are included and that percentages are entered correctly. The system requires the total to equal exactly 100%, so even small rounding differences can cause issues. Make sure you're entering percentages that sum correctly.

## What's Next?

Now that you understand blood controls, you might want to explore [Derivations](/guides/features/derivations/) to see how controls can be used in sample processing, learn about [Bulk Import](/guides/bulk-operations/import/) to add control specimens efficiently, or check out [Reference Data](/guides/reference-data/overview/) to manage strains and other biological data.
