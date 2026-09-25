---
title: Tutorial walkthrough
description: Create a TUT study, import subjects and specimens, then delete the data
---

This walkthrough uses a study whose short code starts with **TUT** (for example **TUT01**). Any member can delete a TUT study, so you can practice without leaving production data behind. If you create a non-tutorial study with a TUT short code, the form warns that any member can delete it.

## Prerequisites

- Setup is complete. See [Initial Setup](/docs/guides/getting-started/setup/).
- At least one specimen type exists (the wizard preloads types such as Whole Blood).
- If you import containers, you need a location that can hold collections. See [Locations](/docs/guides/workflows/locations/).

## Step 1: Create a study

1. Go to **Studies** in the sidebar, or click **Create New Study** on the dashboard.
2. On the Studies list, click **New Study**. From the command palette (**Ctrl+Shift+K** / **Cmd+Shift+K**) you can run **Create New Study**.
3. On the **Create Study** page, fill in:
   - **Title:** Tutorial Study
   - **Short Code:** TUT01
   - **Lead Person:** Tutorial
   - **Description:** optional
   - **Longitudinal Study:** leave unchecked unless you want multiple collection timepoints per subject
4. Click **Create**.

SampleDB opens the study detail page.

For more on studies, see [Studies](/docs/guides/workflows/studies/).

## Step 2: Import subjects

1. Go to **Import** in the sidebar, or click **Bulk Import** on the dashboard.
2. Set **Import Type** to **Subjects Only**.
3. Prepare a CSV with `study_short_code` and `subject_name`:

   ```csv
   study_short_code,subject_name
   TUT01,TUT-SUBJ-001
   TUT01,TUT-SUBJ-002
   TUT01,TUT-SUBJ-003
   ```

   You can also download [tutorial-subjects.csv](/docs/tutorial-csvs/tutorial-subjects.csv).
4. Under **CSV File**, select the file. Use **Download Template** if you want a file that matches the current import type.
5. Click **Validate & Continue**.
6. If validation passes, the import runs. Read the result summary.

You now have three subjects in TUT01. See [Bulk import](/docs/guides/bulk-operations/import/) for other import types.

## Step 3: Import specimens

1. Stay on **Import**, or open it again.
2. Set **Import Type** to **Subjects with Specimens (Combined)**, or **Specimens Only** if the subjects already exist.
3. Set **Container Type**:
   - **No Containers** if you only need study, subject, specimen type, and optional collection date
   - **Micronix Tubes** or **Cryovial Tubes** if you also want containers. New collections need a location.
4. For **No Containers**, include `study_short_code`, `subject_name`, and `specimen_type_name`. `collection_date` (YYYY-MM-DD) is optional.

   ```csv
   study_short_code,subject_name,specimen_type_name,collection_date
   TUT01,TUT-SUBJ-001,Whole Blood,2024-01-15
   TUT01,TUT-SUBJ-002,Whole Blood,2024-01-15
   TUT01,TUT-SUBJ-003,Whole Blood,2024-01-16
   ```

   Specimen type names must match **Reference Data** (they are case-sensitive). Download [tutorial-specimens-no-containers.csv](/docs/tutorial-csvs/tutorial-specimens-no-containers.csv) for this example. Micronix CSVs also need `plate_name`, `barcode`, and `position`. See [Bulk import](/docs/guides/bulk-operations/import/).
5. Select the file under **CSV File**, then click **Validate & Continue**.
6. If the CSV names collections that do not exist, a **Create Collections** step asks you to assign each one to a location. Continue to run the import.
7. Read the result summary.

## Step 4: Verify

1. Go to **Studies** and open **Tutorial Study** (TUT01).
2. Check **Subjects** for TUT-SUBJ-001, TUT-SUBJ-002, and TUT-SUBJ-003.
3. Check **Overview** for subject and specimen counts (and containers if you created them).
4. Open a subject to see specimens and containers.

## Step 5: Delete the tutorial study

1. Open the **Tutorial Study** (TUT01) detail page.
2. Click **Delete study**.
3. Type **TUT01** to confirm, then click **Delete study** again.

SampleDB deletes the study and its subjects, specimens, and related containers. Any user can delete a study whose short code starts with **TUT**. Other studies can be deleted only by administrators.
