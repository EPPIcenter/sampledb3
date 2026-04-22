---
title: qPCR Experiments
description: Define plate layouts, download instrument templates, and import run results
---

qPCR (quantitative PCR) experiments in SampleDB let you define a 96-well plate layout, download a template for your instrument (Bio-Rad CFX 96 or Thermo Fisher Quant Studio), run the assay on the instrument, and then import results back into SampleDB. Result import is currently disabled and will be enabled in a future release. This workflow keeps plate definitions, assay settings, and run data in one place.

The workflow has four steps: **define the plate**, **download the template**, **run the assay on the instrument**, and **import results**.

## Creating an Experiment

From the sidebar, go to **qPCR Experiments**. Click **New Experiment** to create an experiment. You can give it an optional name (for example, a study or run identifier). After creation, you’re taken to the experiment detail page, where you follow the four steps.

## Step 1: Plate Layout

Upload a CSV that describes which tubes go in which wells. The CSV must include micronix barcodes and well positions (e.g. A01, B02). Use the same scanner configuration you use for container move so barcodes resolve correctly.

After upload, the 96-well plate view shows the layout: **standard** (control) wells, **unknown** (study sample) wells, **negative** (NTC) controls, and **empty** wells. Click any well to view details for that position: the **well details** panel below the plate shows the container, specimen, and subject (or control batch) for that well, with links to their detail pages. Empty wells show “No container in this well.” You can mark empty wells as **NTC** (No Template Control) or leave them **empty**: click an empty well, then use **Set as NTC** or **Set as empty** in the panel, or use **Set all empty to NTC** and **Set all NTC to empty** below the plate to toggle all empty wells at once. The plate view clearly distinguishes Empty vs NTC wells. You can change the plate and well types only while the experiment is in setup or in progress; once you’ve imported results, the plate is locked.

## Step 2: Template Settings and Download

Set assay options that go into the instrument template. When you create an experiment, a default target (e.g. varATS) is created so you can download a template right away. You can define **multiple targets** (multiplex): add one or more targets, each with:

- **Target name** (e.g. varATS, 18S)
- **Fluorophore** (Bio-Rad) or **Reporter** (Quant Studio); quencher is set automatically for Quant Studio (SYBR → None, others → NFQ-MGB)

Use **Add target** to add another target; use **Remove** on a row to remove it (at least one target is required). **Instrument type** (Quant Studio only) can be set once for the experiment (e.g. QuantStudio 5 Real-Time PCR System).

The template **Sample Name** is the **micronix barcode** when the well has one (study or control); otherwise control wells use labels (e.g. Neg ctrl, Std-10k) or the field is empty. Parasite density for standard controls appears in the Quantity column. The downloaded template includes **all** targets: the instrument file will have one row per well per target (multiplex). **Save your settings** after changing targets or instrument type; you must save before downloading a template. If you have unsaved changes, a notice is shown and the download buttons are disabled until you save.

**Note:** After you import results (step 4), the list of targets is **locked** and cannot be changed. Add or remove targets only while the experiment is in setup or in progress.

- **Bio-Rad CFX 96** (CSV)
- **Quant Studio** (TXT)

Template download is enabled only after a plate layout has been uploaded.

## Step 3: Run on Instrument

Load the downloaded template on your qPCR instrument and run the assay. This step is done on the instrument, not in SampleDB.

## Step 4: Import Results

Result import is currently disabled and will be enabled in a future release. When available: after the run, upload the result file from your instrument (Bio-Rad CSV or Quant Studio XLS). Select the correct instrument type, choose the file, and upload. SampleDB stores amplification data when present for optional custom curve fitting later.

## Managing Experiments

From **qPCR Experiments**, you see an information-dense table of all experiments. Each row shows name, status (**Setup**, **In progress**, or **Results imported**), template (Bio-Rad CFX 96 or Quant Studio), plate barcode, **target(s)** (comma-separated target names), **assay** (fluorophore/reporter for single-target experiments, or “Multiple” for multiplex), well count, run count, last run date, and created/updated dates. You can filter by status and sort by any column (default: most recently updated first). Click a row to open that experiment. The list API returns well and run counts and last run date so you can scan many experiments without opening each one. You can delete an experiment (and all its plate layout, template, and results) from the experiment detail page; this cannot be undone.
