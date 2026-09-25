---
title: Workshop demo
description: Create a tutorial study, import subjects and specimens, then export the results
---

This sequence is for a live demo. Every CSV uses study **TUT01** and the same subject names so you can repeat it. Download the files from the links below, or use `examples/workshop/` in the repo.

## Prerequisites

- Setup is complete. See [Initial Setup](/docs/guides/getting-started/setup/).
- At least one specimen type exists (the workshop CSVs use **DNA (DBS)**).
- If you import Micronix tubes, you need a location that can hold collections. See [Locations](/docs/guides/workflows/locations/).

## Step 1: Create a study

1. Go to **Studies**, or click **Create New Study** on the dashboard.
2. Click **New Study** (command palette: **Ctrl+Shift+K** / **Cmd+Shift+K** → **Create New Study**).
3. On the **Create Study** page, set **Title** to Tutorial Study, **Short Code** to **TUT01**, and **Lead Person** to Tutorial. Leave **Longitudinal Study** unchecked unless you want multiple timepoints.
4. Click **Create**.

SampleDB opens the study detail page.

## Step 2: Import subjects

1. Go to **Import**, or click **Bulk Import** on the dashboard.
2. Set **Import Type** to **Subjects Only**.
3. Download [1-subjects.csv](/docs/workshop/1-subjects.csv) (or [tutorial-subjects.csv](/docs/tutorial-csvs/tutorial-subjects.csv)). Columns are `study_short_code` and `subject_name`.
4. Select the file under **CSV File**.
5. Click **Validate & Continue**.
6. Read the result summary.

You should have three subjects in TUT01 (TUT-SUBJ-001, TUT-SUBJ-002, TUT-SUBJ-003).

## Step 3: Import specimens

### Option A: No containers

1. Stay on **Import**.
2. Set **Import Type** to **Subjects with Specimens (Combined)**.
3. Set **Container Type** to **No Containers**.
4. Download [2-specimens-no-containers.csv](/docs/workshop/2-specimens-no-containers.csv). Columns are `study_short_code`, `subject_name`, `specimen_type_name`, and `collection_date`. Use a specimen type that exists in **Reference Data**.
5. Select the file under **CSV File**, then click **Validate & Continue**.
6. Read the result summary.

### Option B: Micronix tubes

1. Set **Import Type** to **Subjects with Specimens (Combined)**.
2. Set **Container Type** to **Micronix Tubes**.
3. Download [3-specimens-micronix.csv](/docs/workshop/3-specimens-micronix.csv). Add `plate_name`, `barcode`, and `position` (letter plus two digits, such as A01). Missing or invalid position fails validation.
4. Select the file, then click **Validate & Continue**.
5. If the CSV names collections that do not exist, the **Create Collections** step asks you to assign each collection to a location. Continue to run the import.
6. Read the result summary.

## Step 4: Export data

1. In the sidebar, open **Export** → **Multi-Study Export**.
2. Under **Upload CSV File**, select a subject-list CSV with `study_short_code` and `subject_name`. Optional columns are `collection_date`, or `date_from` and `date_to`. Download [4-export-subject-list.csv](/docs/workshop/4-export-subject-list.csv).
3. Fix any invalid study codes the page reports.
4. Set date tolerance and filters if you need them.
5. Choose format (CSV, XLSX, or JSON) and an export configuration.
6. Click **Export**. The file downloads.
7. Read the export summary for container counts and subjects with no results.

## Optional: Delete the tutorial study

1. Open **Tutorial Study** (TUT01).
2. Click **Delete study**.
3. Type **TUT01**, then click **Delete study** again.

Any user can delete a study whose short code starts with **TUT**.
