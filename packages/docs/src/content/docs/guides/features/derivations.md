---
title: Derivations
description: Track sample processing and transformations
---

Derivations track relationships between containers when materials are processed, extracted, diluted, or otherwise transformed. In laboratory work, specimens often go through multiple processing steps—whole blood might be processed to extract DNA, DNA might be diluted for assays, or material might be distributed into new containers as a tracked step. Derivations help you maintain a complete chain of custody and processing history, showing exactly how each specimen was created and what processing it has undergone.

This tracking is valuable for several reasons. It provides a complete audit trail showing where specimens came from and what was done to them. It helps you understand processing history when analyzing results. It enables quality control by tracking protocols and processing dates. And it maintains relationships that are important for regulatory compliance and scientific reproducibility.

## Aliquots vs derivations

SampleDB uses **Aliquot** and **Derivation** for two different operations. Do not confuse them.

**Aliquot (same specimen)** — When you divide material from one collection event across multiple physical containers without a transformation step. Example: one blood draw registered as a single **Specimen**, split into three tubes. Each tube is a **Container** (an aliquot); all three reference the same specimen. Use specimen registration with multiple containers, or **Add container** on the specimen detail page. No derivation record is created.

**Derivation (transformation)** — When material in a **parent container** is processed into a **child container**, usually creating a new **Specimen** (for example, DNA extracted from whole blood). SampleDB records a parent→child derivation with a derivation type, protocol, and date. This is what the rest of this guide describes.

The derivation type **Distribution** in the UI (stored as `aliquot` in CSV imports) means distribution as a *tracked processing step*—creating a child container and new specimen from a parent—not the same as adding a second container to the same specimen.

## Understanding How Derivations Work

A derivation represents a processing step that creates a new specimen from material in an existing container. Think of it as a transformation: you start with a parent container (the source material), perform some processing (like DNA extraction or dilution), and create a child container (the result). The derivation record links these containers together and documents what processing was done.

The system supports several derivation types that cover common laboratory workflows. DNA Extraction represents extracting DNA from a source specimen, which is common in molecular biology work. Dilution represents diluting a specimen to a different concentration, which is frequently needed for assay preparation. Distribution represents creating a child container from a parent as a tracked distribution step (distinct from same-specimen aliquoting). And Other allows you to document any other type of processing or transformation that doesn't fit the standard categories.

## Derivation Chains and Relationships

Derivations create chains that show the complete processing history of samples. For example, you might start with a whole blood sample in Container A. That gets processed through DNA extraction, creating Container B with extracted DNA. That DNA might then be diluted, creating Container C. The derivation chain shows this complete history: Container A → DNA Extraction → Container B → Dilution → Container C.

This chain structure is powerful because it shows not just immediate parent-child relationships, but the complete ancestry and descendants of any container. You can see all the processing steps that led to a particular sample, and you can see all the samples that were created from a particular source. This complete picture is essential for understanding sample history and maintaining proper chain of custody.

## Creating Individual Derivations

When you need to create a derivation for a single container, the process starts from that container's detail page. Navigate to the container you want to derive from (the **source**), and you'll see a Derivations section that shows any existing derivations involving this container.

Click **Create Derivation** to open the derivation form. The form shows:

- **Source container** — A read-only summary of the container you're deriving from (e.g. barcode, position, specimen type).
- **Derivation type** — What kind of processing you're performing: DNA Extraction, Dilution, Distribution, or Other.
- **Derived specimen type** — The specimen type of the result (e.g. DNA when extracting from DBS).
- **Derived container type** — The container that will hold the derived sample: Micronix Tube, Cryovial Tube, or Paper.
- **Collection (existing)** — Search and select an **existing** collection (plate, box, or sheet) where the new container will go. Create new plates or boxes from Storage first if needed; the single-derivation form only places into existing collections.
- **Barcode / Position** (or **Sublabel** for paper) — The identifier for the new container within that collection. Paper derivations also require a **sheet name** when creating a new sheet or placing on an existing one.
- **Derivation date** — When the processing occurred (defaults to today).
- **Protocol** (optional) — Protocol name or reference.
- **Notes** (optional) — Any additional information.

Once you've filled in the required fields, click **Create derivation**. The system creates the derived specimen, the new container, and the derivation record linking source to derived container.

## Viewing Derivation Information

From any container's detail page, you can see derivation information that shows how that container fits into processing chains. If the container was derived from another container, you'll see source derivation information showing the parent container, what type of derivation was performed, when it occurred, and what protocol was used.

If the container has been used to create other containers, you'll see a list of derived containers showing all the samples that were created from this one. For each derived container, you'll see the derivation type, date, and protocol, giving you a complete picture of what processing has been done.

Some containers show a complete derivation chain view that displays the entire processing history. This shows all ancestor containers (everything this sample came from, going back to the original source), all descendant containers (everything that was created from this sample), and the current container in the middle. This comprehensive view helps you understand the complete processing history at a glance.

## Bulk Derivation Import

When you're processing many samples at once—perhaps extracting DNA from an entire batch of samples—the bulk derivation import lets you create many derivation records from a single CSV file. The flow is similar to specimen bulk import: **Upload** → (optionally **Collections**) → **Import**.

**Step 1: Upload**

- Choose **Source** (Control batch or Study subject) and **Parent container type** (Paper, Micronix tube, or Cryovial tube). These determine the CSV columns and the template.
- Optionally expand **Apply to all rows (optional)** to set derivation type, derived specimen type, derived container type, protocol, and derivation date once; otherwise you can provide these per row in the CSV.
- Select a CSV file and use **Download template** to get a template that matches your source and parent type. The template’s example specimen types, derivation type, and protocol come from your reference data and current import settings, so the examples align with your database.
- Click **Validate & Continue**. The system validates the CSV (parent containers exist, positions and barcodes valid, etc.). Validation does not write to the database.

**Step 2: Collections** (only if validation reports collections to create)

- If your CSV references plates or boxes that do not yet exist, the system shows a **Create missing collections** step. Assign a location for each collection, then click **Create collections & continue**. The system creates the collections and then runs the import.

**Step 3: Import**

- Review the validation summary (valid / invalid / warnings) and the per-row table. Click **Create derivations** to run the import. All derivations are created in one go, or none if any row fails (all-or-nothing). For a comparison of failure semantics across import types, see [Bulk Import — Atomicity and failure behavior](/docs/guides/bulk-operations/import/#atomicity-and-failure-behavior).
- After the run, you see success/error counts and a per-row result table, plus a link **Back to Derivations**.

For micronix tube derivations, **plate_name or collection_barcode** is required in each row. For cryovial tube derivations, **box_name or collection_barcode** is required. For paper derivations, **bag_name** is required, along with **sheet_name**; **sublabel** is optional for the spot identifier. These columns tell the system where the derived containers belong. For micronix tube derivations, **container_barcode** is also required in each row; barcodes are scanned and provided by you—the system does not assign them.

When providing **derivation_type** in CSV, use the stored value (for example `aliquot` for Distribution, `dna_extraction` for DNA Extraction). The UI shows human-readable labels.

**Example: Derivation from controls (DBS to DNA in micronix tubes)** — See `examples/derivation-control-dbs-to-dna/` in the repo for a sample CSV and README. To generate a CSV from your production database, run `scripts/generate_derivation_control_dbs_to_dna_example.sh`.

## Managing Quantities Through Processing

Quantity management in derivations helps you track how much material is available at each step of processing. When you create a derivation, you can choose whether processing consumes material from the parent container. If you extract DNA from a whole blood sample, that processing might consume some of the blood, so you'd want the parent container's remaining quantity to decrease.

The system handles this automatically if you enable quantity reduction. When you specify how much material is in the derived container, the system can reduce the parent's remaining quantity by that amount (or by a different amount if you specify). This helps you track remaining usable material accurately.

Derived containers have their own quantities that track how much material is available. The total quantity represents how much was initially created, and the remaining quantity decreases as material is used. This gives you a complete picture of material availability through the entire processing chain.

## Editing and Managing Derivations

Some derivation details can be edited after creation, which is useful for correcting information or adding details. You can typically edit the derivation date (to correct when processing actually occurred), the protocol (to update protocol information), and notes (to add or modify additional information). Some systems also support custom properties that can be edited.

However, you typically cannot change the parent or derived containers after creation, as this would break the chain of custody. If you need to correct container associations, you may need to contact your administrator, as these changes require careful handling to maintain data integrity.

## Deleting Derivations

Derivations can be deleted if needed, though this should be done carefully. When you delete a derivation, the system removes the relationship record but doesn't delete the containers themselves. This means the parent and derived containers remain, but the link between them is removed.

Deleting derivations can affect chain of custody tracking, so it's generally better to correct information through editing rather than deletion. However, if a derivation was created in error, deletion may be the appropriate solution.

## Best Practices for Derivation Tracking

Effective derivation tracking starts with complete documentation. Always record the protocol used, as this is essential for reproducibility and quality control. Include accurate derivation dates, as these help you understand processing timelines. Add notes when relevant, especially for unusual processing steps or special considerations.

For chain of custody, create derivations for all processing steps. Don't skip steps just because they seem minor—complete chains are more valuable than partial ones. Verify parent containers are correct before creating derivations, as incorrect parent associations can create confusing chains.

When doing bulk processing, use **Validate & Continue** to check your CSV before clicking **Create derivations**. This catches problems early and saves time. Verify imported derivations after bulk import to ensure everything was created correctly, and review derivation chains to confirm they make sense.

## Troubleshooting Derivation Issues

If the system can't find a parent container, verify that the parent container identifier in your CSV is correct. Check that the parent container exists in the system, ensure the source type matches (control vs. subject), and verify that the parent container type matches your settings. Typos in identifiers are a common cause of "parent not found" errors.

Invalid position format errors usually mean positions don't match the required format. For micronix and static wells, use the "A01" format with two-digit columns. Check for typos, and verify positions match the collection layout.

Quantity errors can occur if you're trying to reduce parent quantity but the parent doesn't have enough remaining quantity. Check that parent containers have sufficient material, verify quantity values are valid numbers, and ensure the "Reduce Parent Quantity" setting is configured correctly.

## What's Next?

Now that you understand derivations, you might want to learn about [Container Management](/docs/guides/workflows/containers/) to understand containers better, explore [Bulk Import](/docs/guides/bulk-operations/import/) for other bulk operations, or check out [Blood Controls](/docs/guides/features/blood-controls/) to see how controls can be used as derivation sources.
