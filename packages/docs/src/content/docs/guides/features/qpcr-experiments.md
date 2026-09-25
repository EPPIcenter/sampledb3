---
title: qPCR experiments
description: Plate layout, instrument templates, and result import
---

Define a 96-well plate, download a template for Bio-Rad CFX 96 or Thermo Fisher Quant Studio, run the assay on the instrument, then import results. Result import is disabled. The experiment page shows **Result import is temporarily unavailable.**

Open **qPCR Experiments**. Click **New Experiment**. On the dashboard the same action is **New qPCR experiment**. Name is optional.

## Plate layout

Upload a CSV of micronix barcodes and well positions, for example A01. Use the same scanner configuration as container move.

The plate shows **standard** (control), **unknown** (study sample), **negative** (NTC), and **empty** wells. Click a well for **well details**: container, specimen, and subject or control batch, with links. Empty wells show "No container in this well."

Click an empty well, then **Set as NTC** or **Set as empty**. Below the plate: **Set all empty to NTC** and **Set all NTC to empty**. You can change plate and well types only while status is Setup or In progress. After results are imported, the plate is locked.

## Template settings

A default target (for example varATS) is created with the experiment. For multiplex, add targets with:

- **Target name** (for example varATS, 18S)
- **Fluorophore** (Bio-Rad) or **Reporter** (Quant Studio). Quant Studio quencher is automatic: SYBR → None, others → NFQ-MGB.

**Add target** adds a row. **Remove** deletes one. At least one target is required. **Instrument type** (Quant Studio only) can be set once, for example QuantStudio 5 Real-Time PCR System.

Template **Sample Name** is the micronix barcode when the well has one. Otherwise control wells use labels such as Neg ctrl or Std-10k, or the field is empty. Parasite density for standards goes in Quantity. The file includes all targets: one row per well per target.

Click **Save your settings** after changing targets or instrument type. Unsaved changes disable download.

After results are imported, targets are locked. Add or remove targets only in Setup or In progress.

Downloads, after a plate is uploaded:

- **Bio-Rad CFX 96** (CSV)
- **Quant Studio** (TXT)

## Run on the instrument

Load the template on the instrument. That step is not in SampleDB.

## Import results

Disabled. When it returns: upload Bio-Rad CSV or Quant Studio XLS, matching the instrument type. Amplification data is stored when present.

## Experiment list

Columns: **Name**, **Status** (Setup, In progress, Results imported), **Template**, **Plate**, **Target(s)**, **Assay** (fluorophore/reporter, or Multiple for multiplex), **Wells**, **Runs**, **Last run**, **Created**, **Updated**. Filter by status. Default sort is most recently updated. Click a row to open it.

Delete from the experiment detail page. Deletion includes plate layout, template, and results, and cannot be undone.
