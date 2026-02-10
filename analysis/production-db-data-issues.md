# Production Database Data Issues Analysis

## Purpose

This document describes a repeatable, read-only analysis of the production SQLite database (`sampledb_database.sqlite`) to detect potential data integrity issues: orphaned foreign keys, constraint violations, duplicate records, and inconsistent state. Use it for one-off audits or periodic checks. The schema is defined in `packages/api/src/db/schema.ts`; SQLite does not enforce foreign keys by default, so orphaned references are possible.

## Prerequisites

- A copy of the production database file (e.g. `sampledb_database.sqlite` at repo root or path set via `DATABASE_PATH`). The file is gitignored; use your local or deployed copy.
- `sqlite3` in your PATH (standard on macOS; install via package manager on Linux/Windows).

## How to run

From the repository root, run all checks with:

```bash
sqlite3 /path/to/sampledb_database.sqlite < analysis/scripts/check_data_issues.sql
```

Example if the database is in the repo root:

```bash
sqlite3 sampledb_database.sqlite < analysis/scripts/check_data_issues.sql
```

Output is in column mode with headers. Each section is labeled. **No rows** under a check means **pass**; **any rows** mean potential issues to investigate or fix.

---

## Checks

### 1. Orphaned foreign keys

Child rows reference a parent row that does not exist. These can cause application errors or broken links in the UI.

| Check | What | How to interpret | Reproduction |
|-------|------|-------------------|--------------|
| 1a | Sessions with `user_id` not in `users` | List of session IDs and user_ids to fix or delete | Run script; see "1a. Sessions with missing user" |
| 1b | `study_subject` rows with `study_id` not in `study` | Orphan subjects; fix study_id or remove | Run script; see "1b" |
| 1c | Specimens with `study_subject_id` not in `study_subject` | Study specimens pointing to deleted/missing subject | Run script; see "1c" |
| 1d | Specimens with `control_batch_id` not in `control_batch` | Control specimens pointing to missing batch | Run script; see "1d" |
| 1e | Specimens with `specimen_type_id` not in `specimen_type` | Invalid specimen type reference | Run script; see "1e" |
| 1f | `storage_container` with `specimen_id` not in `specimen` | Containers pointing to deleted specimen | Run script; see "1f" |
| 1g | `storage_container` with `unit_id` not in `unit` | Invalid unit reference | Run script; see "1g" |
| 1h | `storage_container_tag` with missing container or tag | Orphan tag links | Run script; see "1h" |
| 1i | Non-root locations with `parent_id` not in `location` | Broken location tree | Run script; see "1i" |
| 1j | Root locations with NULL or invalid `storage_type_id` | Root must have valid storage type | Run script; see "1j" |
| 1k–1r | Collections (micronix_plate, cryovial_box, box, bag) with missing `location_id`; tubes/papers with missing container or collection; sheets with missing box/bag | Broken storage hierarchy | Run script; see "1k" through "1r" |
| 1s–1t | Papers / static_wells with missing `storage_container` or collection/sheet | Broken container type links | Run script; see "1s", "1t" |
| 1u | `control_batch` with `control_definition_id` not in `control_definition` | Orphan batches | Run script; see "1u" |
| 1v | `container_derivation` with missing parent or child `storage_container` | Broken derivation chain | Run script; see "1v" |
| 1w | `settings` with non-null `user_id` not in `users` | Orphan user settings | Run script; see "1w" |

### 2. Specimen XOR violation

Every specimen must have **exactly one** of `study_subject_id` (study specimen) or `control_batch_id` (control specimen). The schema check `specimen_subject_xor_control` enforces this on insert/update; legacy or direct edits might have left violations.

- **What**: Rows where both are NULL or both are set.
- **SQL** (in script): `SELECT ... FROM specimen WHERE (study_subject_id IS NULL AND control_batch_id IS NULL) OR (study_subject_id IS NOT NULL AND control_batch_id IS NOT NULL)`.
- **Interpret**: No rows = OK. Any rows = fix by setting one FK and clearing the other (or delete if invalid).
- **Reproduction**: Run script; see "2. Specimen XOR violation".

### 3. Duplicate study specimens

Study specimens should be unique on `(study_subject_id, specimen_type_id, collection_date)`. The partial unique index `idx_specimen_study_subject_type_date` (see `packages/api/initial_schema.sql` or `packages/api/src/db/schema.ts`) prevents new duplicates; existing duplicates may remain if the schema was not applied or was run on a copy.

- **What**: Groups with `COUNT(*) > 1` for that triple.
- **SQL** (in script): `SELECT study_subject_id, specimen_type_id, collection_date, COUNT(*) ... GROUP BY ... HAVING COUNT(*) > 1`.
- **Interpret**: No rows = OK. Any rows = duplicate keys; deduplicate (e.g. reassign containers to one specimen, delete duplicates) then ensure the specimen unique index is present (see initial_schema.sql).
- **Reproduction**: Run script; see "3. Duplicate study specimens".

### 4. Location storage-type constraint

Root locations (`parent_id IS NULL`) must have `storage_type_id` set; non-root locations must have `storage_type_id` NULL.

- **What**: (4a) Roots with NULL `storage_type_id`; (4b) non-roots with non-NULL `storage_type_id`.
- **Interpret**: No rows = OK. Any rows = fix location rows to satisfy the constraint.
- **Reproduction**: Run script; see "4a" and "4b".

### 5. Sheet parent constraint

A sheet must not have both `box_id` and `bag_id` set (either one or the other, or both NULL).

- **What**: Rows with both `box_id` and `bag_id` non-NULL.
- **Interpret**: No rows = OK. Any rows = fix by clearing one of the two FKs.
- **Reproduction**: Run script; see "5. Sheets with both box_id and bag_id".

### 6. Container derivation rules

Derivations must have `parent_container_id != child_container_id`, and each child container may appear at most once as `child_container_id`.

- **What**: (6a) Rows where `parent_container_id = child_container_id`; (6b) `child_container_id` values that appear more than once.
- **Interpret**: No rows = OK. Any rows = fix or remove invalid derivation rows.
- **Reproduction**: Run script; see "6a" and "6b".

### 7. Sessions / refs to soft-deleted users

Sessions or audit columns (`created_by`/`updated_by`) pointing to users with `deleted_at` set can cause confusion or errors when resolving user names.

- **What**: (7a) Sessions whose `user_id` has `users.deleted_at` set; (7b) specimens with `created_by` or `updated_by` pointing to a soft-deleted user.
- **Interpret**: No rows = OK. Any rows = consider revoking sessions for deleted users and optionally nulling audit refs (or document as acceptable).
- **Reproduction**: Run script; see "7a" and "7b".

### 8. Container-type coverage

Every `storage_container.id` should appear in exactly one of `micronix_tube`, `cryovial_tube`, `paper`, or `static_well`.

- **What**: (8a) Containers not in any type table; (8b) containers appearing in more than one type table.
- **Interpret**: No rows = OK. (8a) = "base" containers with no type (unexpected); (8b) = data corruption.
- **Reproduction**: Run script; see "8a" and "8b".

---

## Summary table (fill after run)

Run the script and record results here (Pass = no rows; Fail = N rows or describe).

| Check | Result | Notes |
|-------|--------|-------|
| 1a–1w Orphaned FKs | | |
| 2 Specimen XOR | | |
| 3 Duplicate study specimens | | |
| 4a Root location storage_type | | |
| 4b Non-root location storage_type | | |
| 5 Sheet both box and bag | | |
| 6a Derivation parent = child | | |
| 6b Duplicate child in derivation | | |
| 7a Sessions → deleted user | | |
| 7b Specimen audit → deleted user | | |
| 8a Container in no type table | | |
| 8b Container in multiple type tables | | |

---

## Next steps

- If any check returns rows: fix data via the application where possible, or with a one-off migration/script. Re-run this script to confirm. Document decisions or fixes in this file or in `design/` (e.g. `design/data-integrity-remediation.md`).
- For recurring audits: run the script after major imports or migrations and keep the summary table updated.
