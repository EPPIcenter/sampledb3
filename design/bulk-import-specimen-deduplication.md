# Bulk Import Specimen Deduplication

## Goal

Prevent duplicate specimens during bulk import (subjects with specimens and specimens-only). When the same study, subject, specimen type, and collection date are imported again, the system reuses the existing specimen and only creates containers when container data is provided.

## Natural key

A study specimen is uniquely identified by:

- `study_subject_id`
- `specimen_type_id`
- `collection_date` (null/empty treated as one value for matching)

Control specimens (`control_batch_id`) are out of scope; they are not constrained by this uniqueness.

## Database: partial unique index

A partial unique index enforces uniqueness for study specimens only:

- **Index**: `(study_subject_id, specimen_type_id, collection_date) WHERE study_subject_id IS NOT NULL`
- **Migration**: `0009_specimen_unique_study_subject_type_date.sql` deduplicates existing duplicate specimens (keeps one row per key, reassigns containers to the kept specimen, deletes duplicates), then creates the index.
- **SQLite note**: In UNIQUE indexes, NULL in `collection_date` is distinct, so multiple rows with (subject, type, NULL) are allowed by the DB. The application uses get-or-create for all cases (including null date) so we never insert duplicates from our code; the index catches duplicates for non-null dates and any direct inserts.

## API: get-or-create

- **POST /subjects/with-specimens** (Combined import): For each specimen row, look up existing by (subjectId, specimenTypeId, collectionDate). If found, use that specimen and create container only when container data is provided. If not found, insert specimen then create container when provided. Summary `specimensCreated` counts only newly inserted specimens; `containersCreated` counts all containers created.
- **POST /specimens/bulk** (Specimens-only import): Same logic for subject source. Look up existing specimen; if found, reuse and create container if provided; else insert then create container. Response `created` is the number of new specimens inserted; `containersCreated` is the number of containers created.

## Shared helper

`findExistingStudySpecimen(db, studySubjectId, specimenTypeId, collectionDate)` in `packages/api/src/lib/specimen-helpers.ts` implements null-safe date matching and is used by both routes (with-specimens uses it inside the transaction with `tx`).

## Control specimens

Control-batch specimens (`control_batch_id`) are not constrained by this index. No change to control batch creation or add-specimens flows.
