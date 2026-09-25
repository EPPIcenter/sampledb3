---
title: Derivations
description: Record a parent container processed into a child container
---

A **derivation** records a transformation from a **parent container** into a **child container**, usually with a new specimen type, for example DNA extracted from whole blood. The record includes derivation type, protocol, and date.

An **aliquot** is different: several containers of the same specimen, no derivation. Use specimen registration with multiple containers, or **Add container** on the specimen. The derivation type **Distribution** in the UI (stored as `aliquot` in CSV) is a tracked processing step that still creates a child container and a new specimen.

## Derivation types

DNA Extraction, Dilution, Distribution, and Other.

Chains can nest: whole blood → DNA extraction → DNA, then DNA → dilution → diluted DNA. The container detail page shows parent, children, and sometimes the full ancestor and descendant chain.

## Create one derivation

On the **source** container detail page, click **Create Derivation**. If the container already has derivations, the button reads **Create New Derivation**.

- **Source container.** Read-only summary (barcode, position, specimen type).
- **Derivation type.** DNA Extraction, Dilution, Distribution, or Other.
- **Derived specimen type.** Type of the result.
- **Derived container type.** Micronix Tube, Cryovial Tube, Paper, or Static Well.
- **Collection (existing).** Search and select an existing plate, box, or sheet. This form does not create collections. Create those from **Browse Data → Collections** or specimen registration first.
- **Barcode / Position**, or **Sublabel** for paper.
- **Derivation date.** Defaults to today.
- **Protocol** and **Notes.** Optional.

Click **Create derivation**. SampleDB creates the derived specimen, the new container, and the link.

The single-derivation form has no quantity fields.

## Bulk import

Open **Operations → Derivations** and click **Import CSV**. Four steps: **Upload**, **Collections**, **Review & Edit**, **Import**. All rows succeed together or none do. See [Bulk import](/docs/guides/bulk-operations/import/#atomicity).

**Upload.** Choose **Source** (Control Batch or Study Subject) and **Parent container type**. Control batch parents: Paper (DBS spots) or Cryovial Tube. Study subject parents: Paper (DBS spots), Micronix Tube, or Cryovial Tube. Optional **Import settings** set derivation type, derived specimen type, derived container type, protocol, and date for the whole file; otherwise supply them per row. Select a CSV and **Download template** for columns that match the source, parent type, and current settings. Click **Validate & Continue**. Validation does not write.

**Collections.** If the CSV names missing plates or boxes, assign a location each, then click **Create collections & continue**.

**Review & Edit.** Summary of valid, invalid, and warnings, plus a per-row table. Click **Create derivations**.

**Import.** Success and error counts, a per-row table, and **Back to Derivations**.

CSV columns for the derived container:

- Micronix: `plate_name` or `collection_barcode`, and `position`. `container_barcode` is optional.
- Cryovial: `box_name` or `collection_barcode`, and `position`. `container_barcode` is optional.
- Paper: `box_name` or `bag_name`, plus `sheet_name`. `sublabel` is optional.

For `derivation_type` in CSV, use the stored value: `aliquot` for Distribution, `dna_extraction` for DNA Extraction. The UI shows readable labels.

Optional `quantity_used` and `reduce_parent_quantity` per row, or once in **Import settings**. If you reduce quantity, the parent must have enough remaining.

A repository example for DBS-to-DNA from controls is `examples/derivation-control-dbs-to-dna/` (CSV and README). Operators can generate a CSV with `scripts/generate_derivation_control_dbs_to_dna_example.sh`. That is not in the app UI.

## After creation

Type, date, protocol, and notes are read-only on the parent and child container pages. The app has no edit or delete for a derivation. Ask an administrator if a record is wrong.

If the parent is not found, check identifier, source type (control vs subject), and parent container type. Position errors: use `A01` for micronix and static wells.
