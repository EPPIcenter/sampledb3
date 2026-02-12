---
title: Workshop - End-to-End Demo
description: Step-by-step guide for demonstrating the complete SampleDB workflow from creating a study to exporting data
---

This guide walks workshop facilitators and participants through a complete SampleDB workflow: creating a study, bulk importing subjects and specimens, and exporting data. All example data uses study **TUT01** and the same subject names so the sequence is repeatable.

**Example files:** The CSV files used in each step are available on this documentation site (download from the links below) and in the repo at `examples/workshop/`.

## Prerequisites

- **Initial setup is complete.** Your SampleDB instance has at least one specimen type, units, and storage locations. Complete the [Initial Setup](/guides/getting-started/setup/) wizard if needed.
- **At least one specimen type** (e.g. DNA (DBS)) so you can import specimens. Add one in Reference Data or during setup if needed.
- **A location that can hold collections** if you import specimens with containers (e.g. Micronix tubes). See [Location Management](/guides/workflows/locations/).

## Step 1: Create a study

Create the tutorial study that the rest of the workflow will use.

1. Go to **Studies** (sidebar or Dashboard).
2. Click **New Study** (or use the command palette: **Ctrl+K** / **Cmd+K** → "Create New Study").
3. Fill in the form:
   - **Title:** Tutorial Study
   - **Short Code:** **TUT01**
   - **Lead person:** e.g. Tutorial
   - **Description:** (optional)
   - **Longitudinal:** Optional; leave unchecked for a simple single-timepoint demo.
4. Click **Create Study**.

You will be taken to the study detail page. No CSV file is needed for this step.

## Step 2: Import subjects

Add subjects to the tutorial study using bulk import.

1. Go to **Import** (sidebar or Dashboard → Bulk Import).
2. Set **Import Type** to **Subjects Only**.
3. Upload a CSV with columns `study_short_code` and `subject_name`. Download: [1-subjects.csv](/workshop/1-subjects.csv) (or [tutorial-subjects.csv](/tutorial-csvs/tutorial-subjects.csv)).
4. Click **Choose File** (or drag and drop) and select your CSV.
5. Review the preview, then click **Validate & Continue**.
6. If validation passes, the import runs. Check the result summary.

You now have three subjects in study TUT01 (e.g. TUT-SUBJ-001, TUT-SUBJ-002, TUT-SUBJ-003).

## Step 3: Import specimens

Add specimens for those subjects. You can register specimens without containers (simplest) or with Micronix tubes.

### Option A: Specimens without containers (simplest)

1. Stay on **Import** (or go there again).
2. Set **Import Type** to **Subjects with Specimens (Combined)**.
3. Set **Container Type** to **No Containers**.
4. Prepare a CSV with: `study_short_code`, `subject_name`, `specimen_type_name`, `collection_date` (YYYY-MM-DD). Use a specimen type that exists in your Reference Data (e.g. **DNA (DBS)**). Download: [2-specimens-no-containers.csv](/workshop/2-specimens-no-containers.csv).
5. Upload the file, then click **Validate & Continue**.
6. If validation passes, the import runs. Check the result summary.

### Option B: Specimens in Micronix tubes

1. Set **Import Type** to **Subjects with Specimens (Combined)**.
2. Set **Container Type** to **Micronix Tubes**.
3. Prepare a CSV with the same columns as Option A plus: `plate_name`, `barcode`, `position`. The `position` column (well, e.g. A01) is required for micronix imports; missing or invalid position will cause validation to fail with a clear message. Positions must use letter + two digits (e.g. A01, B12). Download: [3-specimens-micronix.csv](/workshop/3-specimens-micronix.csv).
4. Upload the file, then click **Validate & Continue**.
5. If the CSV references collections that do not exist yet, you will see a **Create Collections** step: assign each collection to a location, then continue. The import then runs.
6. Check the result summary.

## Step 4: Export data

Export container-level data for the subjects you just imported.

1. Go to **Export** (sidebar or Dashboard → Export).
2. Upload a subject-list CSV with columns `study_short_code` and `subject_name`. Optional columns: `collection_date`, or `date_from` and `date_to` for date filtering. Download: [4-export-subject-list.csv](/workshop/4-export-subject-list.csv).
3. The system validates study codes. Fix any invalid codes if needed.
4. Set **Date tolerance** and filters (specimen types, container types, date ranges) if desired.
5. Choose export format (CSV, XLSX, or JSON) and an export configuration.
6. Click **Export**. The file downloads.
7. Review the export summary: total containers exported, breakdown by study and subject, and any subjects with no results.

## Cleanup (optional)

When you are done with the demo, you can remove the tutorial data.

1. Open the **Tutorial Study** (TUT01) detail page.
2. Use the **Delete study** action (in the study header or actions menu).
3. When prompted, type the short code **TUT01** to confirm.
4. Confirm deletion.

Any user can delete a study whose short code starts with **TUT**; you do not need to be an administrator.

## What's next?

- [Bulk Import](/guides/bulk-operations/import/) — CSV requirements and import types.
- [Bulk Export](/guides/bulk-operations/export/) — Filters, configurations, and export formats.
- [CSV File Guidelines](/guides/troubleshooting/csv-guidelines/) — Formatting and column requirements.
- [User Journey Guide](/guides/getting-started/user-journey/) — Similar walkthrough with more detail.
