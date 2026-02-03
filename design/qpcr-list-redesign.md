# qPCR Experiments List Redesign

## Goal

Make the main qPCR experiments page information-dense so users can see at a glance all available experiment data when there are many experiments over time. The previous card grid showed only name, status pill, and plate barcode.

## Decisions

- **Table layout**: Replaced the card grid with a single sortable table. One row per experiment with columns: Name, Status, Template, Plate, Target, Assay, Wells, Runs, Last run, Created, Updated. This exposes every field the API provides and supports scanning and sorting.
- **API aggregates**: Extended GET /qpcr-experiments to return per-experiment `wellCount`, `runCount`, and `lastRunAt` (max run created date). These are computed via two grouped queries (wells by experiment, runs by experiment) and merged into each experiment object. This avoids N+1 or requiring the client to open each experiment to see well/run counts.
- **Status filter**: Added a status dropdown (All / Setup / In progress / Results imported) that passes `?status=` to the list endpoint so users can narrow the list.
- **Sort**: Default sort by last updated (desc). All columns that map to a single field are sortable client-side via the existing DataTable component.
- **Theme**: Table uses the existing qPCR “precision lab” theme (qpcr.css): teal hover, theme borders, status pills unchanged. Selected row (keyboard) uses teal accent instead of blue.
- **Empty state**: Unchanged: same copy and “Create experiment” CTA when there are no experiments (or none match the filter).

## Out of scope

- Pagination or cursor-based loading (add later if needed).
- Export or bulk actions on the list.
- Changing the detail or new-experiment flow.
