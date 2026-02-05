# Workshop Demo Rationale

## Goal

Provide a single workshop guide and example CSV files so facilitators can demonstrate the complete SampleDB workflow (create study → import subjects → import specimens → export data) without preparing data by hand.

## Design choices

- **Workshop guide in docs** — The guide lives in `packages/docs/src/content/docs/guides/getting-started/workshop-demo.md` so it is visible in the built documentation and consistent with existing guides (User Journey, Bulk Import, Bulk Export). Sidebar entry under Getting Started: "Workshop: End-to-End Demo".

- **Example files in examples/workshop/** — CSVs live in `examples/workshop/` for easy bundling and copying (e.g. zip the folder for participants). One file per bulk step: 1-subjects, 2-specimens-no-containers, 3-specimens-micronix, 4-export-subject-list. A short README in that folder lists the files and links to the full guide. The same files are copied to `packages/docs/public/workshop/` so they are served with the documentation site and downloadable at `/workshop/1-subjects.csv` etc. when viewing the docs.

- **Reuse of TUT01 and tutorial-style names** — All example data uses study short code **TUT01** and subject names TUT-SUBJ-001/002/003 so the sequence is repeatable and aligned with the existing tutorial CSVs in `packages/docs/public/tutorial-csvs/`.

- **Specimen type DNA (DBS)** — Example specimen CSVs use **DNA (DBS)** (extracted DNA), which is an allowed specimen type for import and containers; WB is not allowed for this workflow.

- **Two specimen options** — The guide and examples support both a minimal path (no containers) and a container path (Micronix tubes) so facilitators can choose the right depth for the audience.

## Files touched

- `packages/docs/src/content/docs/guides/getting-started/workshop-demo.md` — workshop guide (with download links to `/workshop/` files).
- `examples/workshop/1-subjects.csv`, `2-specimens-no-containers.csv`, `3-specimens-micronix.csv`, `4-export-subject-list.csv` — example CSVs (source).
- `packages/docs/public/workshop/` — same four CSVs copied here so they are accessible on the documentation webpage at `/workshop/`.
- `examples/workshop/README.md` — file list and link to guide.
- `packages/docs/astro.config.mjs` — sidebar entry for Workshop: End-to-End Demo.
- `design/workshop-demo-rationale.md` — this file.

No API or app code changes. Existing User Journey guide and tutorial CSVs in docs public remain as-is.
