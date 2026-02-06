# migrate_db.py vs Current Schema — Reconciliation

Review of `scripts/migrate_db.py` against `packages/api/src/db/schema.ts`: what the migration changes and where it diverges or does something unusual.

---

## What the migration does (high level)

1. **Schema bootstrap** — Creates or ensures existence of: `users`, `sessions`, `tag`, `storage_container_tag`, `unit`, `control_definition`, `control_batch`, `storage_type`, `strain`, `specimen_type`, `study`, `study_subject`, `reagent`, `cell_line`, `plasmid`, `standard`, `location`, collection tables (`micronix_plate`, `cryovial_box`, `box`, `bag`), `specimen`, `storage_container`, `sheet`, `paper`, `container_derivation`, `settings`, `error_logs`, qPCR tables, `audit_logs`, etc.

2. **Legacy → new transformations**
   - **Specimen**: Add `control_batch_id`, subject/control XOR constraint; copy from old `specimen`, then drop/rename.
   - **Storage container**: Replace `state_id`/`status_id` with `unit_id`, `total_quantity`, `remaining_quantity`; migrate “Archived” state to tags; copy into `storage_container_new`, then drop/rename.
   - **Container tables**: Rename `manifest_id` → `collection_id` in `micronix_tube`, `cryovial_tube`, `static_well` (with new tables and data copy).
   - **Paper/DBS**: Consolidate single-paper boxes/bags; create `sheet`/`paper_new`; migrate DBS and control spots; delete old `paper` containers not in `paper_new`; drop `paper`, rename `paper_new` → `paper`.
   - **Controls**: Convert `blood_spot_collection` / `whole_blood_tube` / `malaria_blood_control` into `control_definition` + `control_batch` + specimens/containers; “move remaining specimens” from control studies to batches; **DNA (DBS)/(WB) micronix** controls (any study) to batches; deduplicate `control_batch.name` and add UNIQUE; delete migrated control `study_subject` rows that have no remaining specimens.
   - **Location**: If old schema has `location_root` / `level_I` / `level_II` / `level_III`, rebuild hierarchy into `location_new` (parent_id, path), then drop/rename.
   - **Control definition**: If old columns exist (`composition_id`, `target_density`, etc.), move data into `properties` JSON and optionally recreate table without those columns.
   - **Settings**: Add `user_id` (nullable) and composite PK (key, user_id) if missing.
   - **Auditing**: Add `created_by` / `updated_by` to a fixed list of tables (including `location`).
   - **Users**: Add `username`, `deleted_at` (CREATE TABLE and step 12); create default admin user.
   - **qPCR**: Add `plate_barcode`, `instrument_type`; create `qpcr_experiment_target` and migrate single target/dye from `qpcr_experiment` into it; create run/well-result/amplification tables.
   - **No audit_logs**: Migration does not create `audit_logs`; only users has deleted_at per schema.

3. **Drops** — Removes legacy tables: `blood_spot_collection`, `dbs_control_sheet`, `dbs_bag`, `malaria_blood_control`, `control_collection`, `archived_dbs_blood_spots`, `whole_blood_tube`, `status`, `sample_type`, `tube`, `composition_strain`, `composition`, `state_status_relationship`, `state`, etc.

---

## Reconciliation with current schema

### Aligned

- **Specimen**: Subject/control XOR, `control_batch_id`, indexes — migration and schema match.
- **Storage container**: `specimen_id`, `unit_id`, quantities, timestamps — match; migration adds auditing columns later.
- **Container types**: `micronix_tube` / `cryovial_tube` / `static_well` with `collection_id`; `paper` with `sheet_id`; schema matches.
- **control_definition / control_batch**: After migration (including name dedup + UNIQUE), structure matches schema (name unique on batch, properties JSON, etc.).
- **Location**: Parent_id, path, storage_type_id, can_contain_collections; migration adds created_by/updated_by in step 11 — matches schema.
- **container_derivation, settings, error_logs, qPCR tables**: Intent and final shape match schema.
- **study, study_subject**: Migration adds created_by/updated_by — matches schema.

### Divergences / unusual points

1. **Unit table — extra columns in DB**
   - **Migration**: Creates `unit` with `base_unit_id`, `conversion_to_base`, `numerator_unit_id`, `denominator_unit_id` (compound/conversion) and seeds derived/compound units (e.g. mL, p/uL).
   - **Schema**: Comment says “simplified (conversion and compound unit features removed for now)”; only `id`, `symbol`, `name`, `category`.
   - **Effect**: Migrated DB has extra columns; app/schema ignores them. No functional bug; just a richer DB than the app currently models.

2. **Users**
   - **Migration**: Creates `users` with `deleted_at` only (no `uuid`, no `deleted_by`), aligned with schema.

3. **Default admin user**
   - **Migration**: Inserts a default user (e.g. Max, test@test.com, password `maxwell123`) with `INSERT OR IGNORE`.
   - **Unusual**: Hardcoded credentials in a migration script; acceptable for dev/setup, risky if run blindly in production. Worth calling out in docs or env gating.

4. **control_batch.name uniqueness**
   - **Migration**: Initially creates batches with non-unique names (e.g. study title + lead person). Later step deduplicates by renaming to `"name (1)"`, `"name (2)"`, etc., then adds `CREATE UNIQUE INDEX ... ON control_batch(name)`.
   - **Schema**: `name` NOT NULL unique.
   - **Effect**: Correct; migration brings DB in line with schema. Unusual only in that uniqueness is enforced in a later step rather than at first create.

5. **strain / storage_type — extra columns in DB**
   - **Migration**: Creates `strain` and `storage_type` with `created`, `last_updated`.
   - **Schema**: Only `id`, `name`, `description` (no timestamps).
   - **Effect**: Same as unit: extra columns in DB, harmless.

6. **Position CHECK on tube tables**
   - **Migration**: `micronix_tube` / `cryovial_tube` use `position VARCHAR CHECK(length("position") > 1 OR "position" IS NULL)`.
   - **Schema**: `position` is plain `text('position')` with no check.
   - **Effect**: DB enforces “position either NULL or length > 1”; schema doesn’t document this. Minor divergence; consider adding a check in schema for documentation.

7. **Specimen / storage_container primary key**
   - **Migration**: Recreates `specimen` and `storage_container` with `id INTEGER NOT NULL PRIMARY KEY` (no explicit AUTOINCREMENT). Data is copied so existing IDs are preserved.
   - **Schema**: Both use `primaryKey({ autoIncrement: true })`.
   - **Effect**: In SQLite, INTEGER PRIMARY KEY still auto-generates when omitted, so new rows get new IDs. Aligned in practice.

8. **Order of operations**
   - **Unusual**: “Archived” state is converted to tags while the old `storage_container` still exists; then `storage_container` is replaced. Tags are copied from old container rows before the table is dropped. Correct but order-sensitive.

9. **Deletion of paper containers**
   - **Migration**: `DELETE FROM storage_container WHERE id IN (SELECT id FROM paper) AND id NOT IN (SELECT id FROM paper_new)` then drop `paper` and rename `paper_new` to `paper`.
   - **Effect**: Any container that was in old `paper` but not migrated into `paper_new` is removed. Intentional one-way cleanup; worth being explicit that this is destructive for non-migrated paper rows.

---

## Summary

- The migration and the current schema are **largely aligned** for core entities (specimen, storage_container, control_definition/control_batch, location, container types, settings, qPCR, etc.). Auditing and soft-delete columns are added in later steps and match the schema.
- **Unusual or noteworthy**:
  - **Unit**: Migration creates a “full” unit model (conversion/compound); schema uses a subset. No conflict.
  - **Users**: Migration adds `uuid` and `deleted_by`; schema doesn’t define them. Consider adding them to the schema if the app or other tools use them.
  - **Default admin**: Hardcoded default user; document or restrict for production.
  - **control_batch.name**: Uniqueness enforced in a later step after deduplication.
  - **Position CHECK**: Enforced in DB but not in schema; optional to add in schema for clarity.
  - **Paper migration**: Destructive for containers not present in `paper_new`; behavior is intentional but should be understood.

No blocking mismatches were found. The migration no longer adds `uuid` or `deleted_by`; it is aligned with the schema. Optionally add the position CHECK to the schema for consistency.
