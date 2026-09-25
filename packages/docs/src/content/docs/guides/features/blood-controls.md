---
title: Blood controls
description: Compositions, definitions, batches, and inventory
---

Blood controls are quality-control specimens from defined batches, not study subjects. The model is **composition** (strain mix and percentages) → **definition** (that mix plus a target density) → **batch** (one production run with specimens).

The UI is organized by composition. You see compositions grouped by strain signature, then density variants (definitions) and their batches.

Strains must exist in **Reference Data → Strains** before you can use them. Percentages in a composition must total exactly 100%.

## Compositions list

On **Blood Controls**, the **Compositions** tab lists each unique strain mix. Each row shows how many density variants, batches, and inventory. Click **View** or the row to open the composition.

The composition page shows the strain bar and percentages, then **Density variants**. Each variant is one definition. From here you can open a definition, click **Create batch**, or **Add batches from CSV**.

Filter the list by search term, strains (**Contains** or **Exact**), and target density range. On the **Control Batches** tab, filter by search, production date range, strains, and density range.

## Create a definition

On the Compositions tab, click **New Blood Control Definition**. The form order is composition, then densities, then names.

1. **Strain composition.** Add parasite strains and percentages. Total must be 100%. Use **Add strain**.
2. **Target densities.** Choose a concentration unit once, then enter one or more density values. **Add density** adds a row; × removes one. Each value becomes one definition.
3. **Definition names.** A table of **Density** and **Definition name**. Suggested names are filled in, for example `100_StrainA`. You can edit them. **Auto-generate name** appears only when editing an existing definition, not on create.

Click **Create**. Multiple densities create multiple definitions. Existing batches keep the composition they were created with. New batches use the edited definition.

When you create definitions from the batch wizard (**Create new definition** on Batch Info), the same form is used. After creating several, the first is selected so you can continue; the others stay in the list.

## Create a batch

### Manual, one density

Open the composition or definition, then click **Create batch**. The wizard suggests a batch name from the definition and today's date. You can edit name and production date, then add specimens (manually or from one CSV).

For CSV, one collection per file. The collection name defaults to the filename without `.csv`. The collection field is a combobox scoped to type (box, bag, micronix plate, cryovial box). Pick an existing collection, or **Create new collection** and a location; the collection is created on submit.

For **paper (DBS)**, **sheet name** is required in the Containers step. There is no default.

### From CSV, multiple files

From a composition, click **Add batches from CSV**.

On Upload CSV you can set **production date** (defaults to today). The same date applies to all batches in the run; you can change it on Review.

Upload one or more CSVs. Each file is one collection. Default collection name is the filename without `.csv`. Use **Download template** for columns and examples that match your specimen types and **Container Type Units**.

Container type is inferred when possible: a `sheet_name` column means paper; a `position` column without `sheet_name` means cryovial (you can switch to micronix on Containers). When inferred, the dropdown shows "(inferred from CSV)".

For paper, every row needs a sheet name: a `sheet_name` column, or one sheet name in Containers for the whole file. If the CSV has one sheet name, Containers shows it read-only. If it has several, it lists them. The editable field appears only when there is no `sheet_name` column. You cannot go to Review until every paper row has a sheet name.

Optional **density** column: rows are grouped by density and one batch is created per density. Each density must already have a definition for that composition. If a density has no definition, Review blocks submit. If several definitions share the same numeric density, Review shows a definition selector. The Review table shows density with unit when the definition has one. Without a density column, all rows in a file are one batch and you must have a single density in context.

Review previews file, collection, density, definition, and specimen count. Submit uses your chosen definitions. It does not create definitions automatically.

### Collection resolution

As you type a collection name, matches appear with location. Selecting one reuses it. For a new name, **Create new collection** plus a location creates it on submit. This applies to both flows so you do not duplicate collections of the same name and type.

### Wizard steps

Manual: Batch Info, Specimen Types, CSV Upload, Containers, Review.

**Add batches from CSV:** start at Upload CSV, then Containers (including sheet name for paper), then Review.

You can add specimens later from the batch detail page with **Add Specimens**, or import with source type **Control** and the batch name.

## Use a control as a specimen source

On specimen registration, select **Control** as source type, then the batch. Complete specimen type, optional collection date, and container fields as usual.

Inventory counts spots, micronix tubes, cryovial tubes, and static wells. Definition pages sum inventory across batches of that definition.

If percentages will not save, they do not total 100%. If a definition is missing when creating a batch, open the composition and use **View**. CSV batch creation starts from the composition with **Add batches from CSV**.
