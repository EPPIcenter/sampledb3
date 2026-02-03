# Specimen types in backup DB (sampledb_database_bk.sqlite)

## DNA / DBS / WB related types

| id | name |
|----|------|
| 1 | DNA (DBS) |
| 2 | DNA (WB) |
| 36 | DBS |
| 21 | WB (CTRL) |
| 32 | DBS- sample not extracted |
| 15 | DNA (BC) |
| 40 | DNA (DBS 1:2) |
| 39 | DNA (DBS 1:5) |
| 35 | DNA (WB 1:5) |
| ... | (others) |

## malaria_blood_control table

Links control subject to composition and density. Used to build control_definition and control_batch.

- study_subject_id → study_subject.id
- composition_id → composition.id
- density (REAL)
