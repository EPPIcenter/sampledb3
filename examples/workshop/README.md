# Workshop Example Files

Example CSV files for the SampleDB workshop end-to-end demo. Use them in order with the workflow in the documentation.

| File | Step | Purpose |
|------|------|---------|
| `1-subjects.csv` | Step 2 | Subjects only import — study_short_code, subject_name |
| `2-specimens-no-containers.csv` | Step 3a | Specimens without containers — specimen type DNA (DBS), collection dates |
| `3-specimens-micronix.csv` | Step 3b | Specimens in Micronix tubes — one plate, barcodes, positions A01–A03 |
| `4-export-subject-list.csv` | Step 4 | Export by subject list — same three subjects for TUT01 |

**Full guide:** [Workshop: End-to-End Demo](/guides/getting-started/workshop-demo/) in the SampleDB user documentation.

**On the documentation site:** When viewing the built docs (e.g. after running the docs dev server or in production), the same files are available at `/workshop/` (e.g. `/workshop/1-subjects.csv`) so you can download them directly from the guide.

**Prerequisites:** Create study TUT01 (Step 1) before importing. Use specimen type **DNA (DBS)** (or ensure it exists in Reference Data). For Micronix import, assign the new plate to a location when prompted.
