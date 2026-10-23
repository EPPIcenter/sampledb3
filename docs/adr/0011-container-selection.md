# Container selection: one module decides which Containers a filter matches

---
status: accepted
---

**Container export** and the statistics dashboard each turned their filters into a set of **Containers** their own way, and the filters drifted apart. Export matched Containers carrying every selected **Tag** while `GET /containers` matched any of them, and statistics re-implemented the intersection inline. "Created" meant `storageContainer.created` in export and `specimen.created` in statistics. The container-type filter ran up to twice per export, once in a `filterContainerIdsByType` call and again inside `enrichContainerData`, and the GET export returned "No containers found" before applying it. Multi-study export queried one Study at a time and invented a `MULTI` study record to satisfy enrichment. In statistics, the branch for location-only and tag-only filters could never run.

We put **Container selection** (see [CONTEXT.md](../../CONTEXT.md)) behind one module, `packages/api/src/lib/container-selection/`.

## Interface

- One function takes a selection and returns the matching Container rows, the matching Specimen rows, and each Container's type. It never enriches: callers pass the rows to `loadContainerReadViews` ([ADR 0009](./0009-container-read-view.md)).
- A selection is one of:
  - a **Study**;
  - a subject list of (Study, Subject ids, per-subject dates) entries spanning any number of Studies;
  - a micronix barcode list;
  - the whole database.
- The study and subject-list selections are subject-only. The whole-database selection takes a source type filter (**Subject** or **Control batch**). A barcode list selects exactly those tubes and takes no other filters.
- Every other selection takes the same filters:
  - specimen types (a list);
  - collection date range;
  - Specimen created;
  - Container created;
  - container types;
  - Tags;
  - **Location**.
- The module takes resolved ids. Callers resolve study codes, subject names and location ids, and return their own 404s. An unknown id inside a selection matches nothing.
- Queries stay bounded: subqueries or chunked IN lists, never an IN list that grows with the upload.

## Rules the module owns

- **Tags**: a Container matches when it carries every selected Tag. This holds for every caller, `GET /containers` included.
- **Created**: Specimen created and Container created are separate filters. The routes keep their wire names: export's `created_from`/`created_to` map to Container created, and statistics' to Specimen created.
- **Container type**: applied once, here. The GET export's "No containers found" 404 now fires on the filtered result, so a Study whose Containers are all of other types returns 404 instead of an empty file. The type `unknown` matches Containers with no subtype row; any other unrecognised type matches nothing.
- **Location**: the Location and every Location under it.
- **Collection dates**: a listed Subject with its own dates ignores the global collection-date range. Undated Subjects get the global range. Tolerance widens exact dates only.
- **Specimens**: with no Container-level filter (container type, Tag, Location, Container created), every matching Specimen is included, with or without Containers. With one, only Specimens that have a matching Container are included. Export ignores Specimens with no Container.

## Considered options

- **"Any selected Tag" for `GET /containers`**: rejected. One meaning per filter is the point. No web caller sends `tag_ids` there, so only external clients are affected.
- **Container created everywhere**: rejected for now. It would silently change what the statistics dashboard counts. Naming both filters keeps current behaviour and makes the difference visible.
- **Unifying the Container export `run*` executors**: still a non-goal (ADR 0009). This module sits under them and only selects.

## Consequences

- `build*Query` in `lib/export/query.ts`, `filterContainerIdsByType`, `lib/container-tag-filter.ts`, and the tag intersection and dead branch in `dashboard-stats.ts` are deleted as their callers migrate.
- `enrichContainerData` loses its type filter and its `_specimens`, `study` and `subjectToStudyMap` parameters. It takes study fields from the Source's study chain ([ADR 0007](./0007-specimen-source-resolution.md)). The `MULTI` study record survives only in JSON export metadata.
- Callers build the **Export summary** from the module's output, grouping by Study for multi-study export.
- Migration is in slices, each deleting the code it replaces: the module with Container export, then dashboard statistics, then the `GET /containers` tag rule.
- The first slice adds a `CODING_STANDARDS.md` rule pointing new export and statistics code at this module, and lists the paths that haven't migrated yet.
- The statistics slice relabels the dashboard's "Created" filter as "Specimen created". The wire is unchanged.
- The module's tests cover each filter for every selection kind against the in-memory database. Statistics and export route tests keep aggregation and envelope checks.
