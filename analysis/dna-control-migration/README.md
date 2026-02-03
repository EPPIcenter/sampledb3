# DNA control migration analysis

This directory holds the analysis used to extend the legacy DB migration so that **extracted DNA in micronix tubes** (specimen types "DNA (DBS)" and "DNA (WB)") are converted into the new blood control system.

## Summary

- **Problem**: Paper DBS controls were converted; whole blood tubes were converted; DNA (DBS) and DNA (WB) in micronix tubes were not, because they live in studies that don’t match `title LIKE '%control%'` / `short_code = 'CTRL'` (e.g. date-titled studies like `2016-07-07`, `2023-01-01`).
- **Fix**: A new step in `scripts/migrate_db.py` selects specimens that are (1) type "DNA (DBS)" or "DNA (WB)", (2) in a `micronix_tube`, and (3) linked to a `study_subject` that appears in `malaria_blood_control`, then assigns them to the correct control batch (same `get_or_create_batch` + `UPDATE specimen` pattern as “Move remaining specimens”) and adds their subjects to `migrated_subject_ids` for cleanup.

## Files

- `01-specimen-types.md` – Specimen type IDs and `malaria_blood_control` schema in the backup DB.
- `02-findings.md` – Why DNA micronix controls were skipped and the intended fix.

## Database explored

- **Backup DB**: `sampledb_database_bk.sqlite` (old production DB).
- **Tool**: `sqlite3` (queries run from repo root).

## Counts (backup DB)

- 413 DNA (DBS) control specimens in micronix tubes.
- 25 DNA (WB) control specimens in micronix tubes.
- 438 total DNA control micronix tubes converted by the new step.
