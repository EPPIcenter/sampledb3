---
title: User Journey Guide
description: Walk through creating a study, importing subjects, and importing specimens using tutorial data you can delete afterward
---

This guide walks you through the main actions in SampleDB: creating a study, importing subjects, and importing specimens (and optionally containers). You'll use suggested **tutorial data**—a study whose short code is in the **TUT namespace** (e.g. **TUT01**)—so you can try the workflow without affecting real data. When you're done, any user can delete the tutorial study to clean up. Studies whose short code starts with **TUT** can be deleted by any user; when creating a study outside the tutorial with such a code, the app shows a warning.

For detailed explanations of each feature, see the linked guides. Here we focus on one end-to-end path so you see how the pieces fit together.

## Prerequisites

- **Initial setup is complete.** Your SampleDB instance has at least one specimen type, units, and storage locations. If you haven't finished setup, complete the [Initial Setup](/guides/getting-started/setup/) wizard first.
- **At least one specimen type** (e.g. Whole Blood) so you can import specimens. Add one in Reference Data or during setup if needed.
- **A location that can hold collections** if you import specimens with containers (e.g. a freezer). See [Location Management](/guides/workflows/locations/) and [Initial Setup](/guides/getting-started/setup/).

## Step 1: Create a study

Create the tutorial study that everything else will use.

1. In SampleDB, go to **Studies** (sidebar or Dashboard).
2. Click **New Study** (or use the command palette: **Ctrl+K** / **Cmd+K** → "Create New Study").
3. Fill in the form with these suggested values:
   - **Title:** Tutorial Study  
   - **Short Code:** Use **TUT01**.
   - **Lead person:** Tutorial  
   - **Description:** (optional)  
   - **Longitudinal:** Check if you want multiple collection timepoints per subject; leave unchecked for a simple single-timepoint example.
4. Click **Create Study**.

You'll be taken to the study detail page. Use your tutorial study's short code in imports and for cleanup. For more on studies, see [Studies Management](/guides/workflows/studies/).

## Step 2: Import subjects

Add a few subjects to the tutorial study using the bulk import.

1. Go to **Import** (sidebar or Dashboard → Bulk Import).
2. Set **Import Type** to **Subjects Only**.
3. Prepare a small CSV with two columns: `study_short_code` and `subject_name`. Example:

   ```csv
   study_short_code,subject_name
   TUT01,TUT-SUBJ-001
   TUT01,TUT-SUBJ-002
   TUT01,TUT-SUBJ-003
   ```

   You can type this into a text editor and save as `.csv`, or download the sample: [tutorial-subjects.csv](/tutorial-csvs/tutorial-subjects.csv).
4. Click **Choose File** (or drag and drop) and select your CSV.
5. Review the preview, then click **Validate & Continue**.
6. If validation passes, the import runs. Check the result summary.

You now have three subjects in study TUT01. For more on import types and CSV format, see [Bulk Import](/guides/bulk-operations/import/).

## Step 3: Import specimens (and optionally containers)

Add specimens for those subjects. You can register specimens without containers, or assign a container type (e.g. Micronix Tubes, Cryovial Tubes, or No Containers).

1. Stay on **Import** (or go there again).
2. Set **Import Type** to **Subjects with Specimens (Combined)** (or **Specimens Only** if you prefer to add only specimens to existing subjects).
3. Set **Container Type**:
   - **No Containers** – simplest: only study, subject, specimen type, and optional collection date.
   - Or choose a type (e.g. **Micronix Tubes**, **Cryovial Tubes**) if you want to create containers and possibly collections; you'll need a location for any new collections.
4. Prepare a CSV. For **No Containers**, use at least:
   - `study_short_code`, `subject_name`, `specimen_type_name`
   - Optional: `collection_date` (YYYY-MM-DD)

   Example (no containers):

   ```csv
   study_short_code,subject_name,specimen_type_name,collection_date
   TUT01,TUT-SUBJ-001,Whole Blood,2024-01-15
   TUT01,TUT-SUBJ-002,Whole Blood,2024-01-15
   TUT01,TUT-SUBJ-003,Whole Blood,2024-01-16
   ```

   Use a specimen type that exists in your Reference Data (e.g. **Whole Blood**); names are case-sensitive. For the no-containers example you can download: [tutorial-specimens-no-containers.csv](/tutorial-csvs/tutorial-specimens-no-containers.csv). If you use a container type, add the required columns (e.g. for Micronix: `plate_name`, `barcode`, `position`). See [Bulk Import](/guides/bulk-operations/import/) and [Container Management](/guides/workflows/containers/) for exact columns and formats.
5. Upload the file, then click **Validate & Continue**.
6. If the CSV references collections that don't exist yet, you'll see a **Create Collections** step: assign each collection to a location, then continue. The import then runs.
7. Review the import result summary.

For more on specimen types, containers, and CSV requirements, see [Subjects & Specimens](/guides/workflows/subjects-specimens/) and [Bulk Import](/guides/bulk-operations/import/).

## Step 4: Verify

Confirm that the tutorial study looks correct.

1. Go to **Studies** and open **Tutorial Study** (TUT01).
2. On the study detail page, check:
   - **Subjects** tab: you should see the subjects you imported (e.g. TUT-SUBJ-001, TUT-SUBJ-002, TUT-SUBJ-003).
   - **Overview**: total subjects and specimens (and containers if you used them).
3. Open a subject to see their specimens and, if applicable, containers.

## Step 5: Clean up (delete the tutorial study)

When you're done trying the workflow, remove the tutorial data by deleting the study.

1. Open the **Tutorial Study** (TUT01) detail page.
2. Use the **Delete study** action (in the study header or actions menu).
3. When prompted, type the short code **TUT01** to confirm.
4. Confirm deletion.

The system deletes the study and all its subjects, specimens, and related containers. **Any user can delete a study whose short code starts with TUT** (the tutorial namespace); you do not need to be an administrator. Other studies can only be deleted by administrators. If you create a study outside the tutorial with a short code starting with TUT, the app will warn you that such studies can be deleted by any user.

If you prefer to keep the data for practice, you can leave the tutorial study in place and delete it later the same way.

## What's next?

- Use the same workflow with real studies, subjects, and specimen types.
- Try [Bulk Export](/guides/bulk-operations/export/) to export data for your studies.
- Explore [Container Movement](/guides/bulk-operations/container-movement/) and [Collection Move](/guides/features/collection-move/) to reorganize containers and collections.
