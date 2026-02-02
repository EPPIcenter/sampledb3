---
title: qPCR Experiments
description: Define plate layouts, download instrument templates, and import run results
---

qPCR (quantitative PCR) experiments in SampleDB let you define a 96-well plate layout, download a template for your instrument (Bio-Rad CFX 96 or Thermo Fisher Quant Studio), run the assay on the instrument, and then import results back into SampleDB. This workflow keeps plate definitions, assay settings, and run data in one place.

The workflow has four steps: **define the plate**, **download the template**, **run the assay on the instrument**, and **import results**.

## Creating an Experiment

From the sidebar, go to **qPCR Experiments**. Click **New Experiment** to create an experiment. You can give it an optional name (for example, a study or run identifier). After creation, you’re taken to the experiment detail page, where you follow the four steps.

## Step 1: Plate Layout

Upload a CSV that describes which tubes go in which wells. The CSV must include micronix barcodes and well positions (e.g. A01, B02). Use the same scanner configuration you use for container move so barcodes resolve correctly.

After upload, the 96-well plate view shows the layout: **standard** (control) wells, **unknown** (study sample) wells, **negative** controls, and **empty** wells. Click any well to view details for that position: the **well details** panel below the plate shows the container, specimen, and subject (or control batch) for that well, with links to their detail pages. Empty wells show “No container in this well.” You can change the plate only while the experiment is in setup; once you’ve exported a template or imported results, the plate is locked.

## Step 2: Template Settings and Download

Set assay options that go into the instrument template:

- **Target name** (e.g. varATS)
- **Fluorophore** (Bio-Rad) or **Reporter** (Quant Studio); quencher is set automatically for Quant Studio (SYBR → None, others → NFQ-MGB)
- **Instrument type** (Quant Studio only, e.g. QuantStudio 5 Real-Time PCR System)

Templates use **study subject names** for unknown (study) samples and **parasite density** for standard controls. Save settings, then download the template for your instrument:

- **Bio-Rad CFX 96** (CSV)
- **Quant Studio** (TXT)

Template download is enabled only after a plate layout has been uploaded.

## Step 3: Run on Instrument

Load the downloaded template on your qPCR instrument and run the assay. This step is done on the instrument, not in SampleDB.

## Step 4: Import Results

After the run, upload the result file from your instrument (Bio-Rad CSV or Quant Studio XLS). Select the correct instrument type, choose the file, and upload. SampleDB stores amplification data when present for optional custom curve fitting later.

## Managing Experiments

From **qPCR Experiments**, you see all experiments with their status: **Setup**, **Template ready**, or **Results imported**. Open an experiment to edit settings, re-download templates, or import results. You can delete an experiment (and all its plate layout, template, and results) from the experiment detail page; this cannot be undone.
