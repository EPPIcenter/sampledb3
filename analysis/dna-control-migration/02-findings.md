# DNA control migration – findings

## Why extracted DNA in micronix tubes are not converted

1. **Control studies filter**  
   The migration only considers studies where `title LIKE '%control%'` OR `short_code = 'CTRL'`:
   ```python
   cursor.execute("SELECT id FROM study WHERE title LIKE '%control%' OR title LIKE '%CTRL%' OR short_code = 'CTRL'")
   control_study_ids = [...]
   ```
   The "Move remaining specimens" step then only migrates specimens whose `study_subject.study_id` is in `control_study_ids`.

2. **DNA control studies in the backup DB**  
   DNA (DBS) and DNA (WB) control specimens in micronix tubes live in studies that are **date-titled** and do not match that filter:
   - 94: 2016-07-07  
   - 101: 2023-01-01  
   - 116: 2023-08-30  
   - 117: 2024-05-17  
   - 121: 2021-04-02  
   - 132: 2023-05-19  

   So those specimens are never selected for conversion.

3. **Counts in backup DB**  
   - **413** DNA (DBS) control specimens in micronix tubes (specimen_type_id = 1, study_subject in malaria_blood_control).  
   - **25** DNA (WB) control specimens in micronix tubes (specimen_type_id = 2).  
   - **438** total DNA control micronix tubes to convert.

4. **Identification of DNA control specimens**  
   - Same as existing logic: `study_subject` is in `malaria_blood_control` (subject is a control).  
   - Additionally: `specimen_type` is "DNA (DBS)" or "DNA (WB)" and the container is a `micronix_tube` (join via `storage_container`).

## Intended fix

Add a dedicated step that:

1. Resolves specimen_type IDs for "DNA (DBS)" and "DNA (WB)" by name (so it works across DBs).
2. Selects all specimens that:
   - have `specimen_type_id` in (DNA (DBS), DNA (WB)),
   - have `study_subject_id` in `malaria_blood_control.study_subject_id`,
   - and have at least one `storage_container` row whose id is in `micronix_tube.id`.
3. For each such specimen:
   - `get_or_create_batch(subject_name, density, comp_id, subject_id, study_id, created)` (reuse existing helper).
   - `UPDATE specimen SET control_batch_id = batch_id, study_subject_id = NULL WHERE id = spec_id`.
4. Add those `study_subject_id`s to `migrated_subject_ids` so the existing cleanup can delete control-only subjects when they have no remaining specimens.

No new containers or plates are created; we only attach existing DNA control specimens to the correct control batch (same pattern as "Move remaining specimens" for other control specimens).

## Parasite composition and density

Yes. For these DNA micronix tubes we already resolve composition and density:

- Each specimen is linked to a `study_subject` that has one row in `malaria_blood_control`; that row has `density` and `composition_id`.
- The DNA micronix query selects `mbc.density` and `mbc.composition_id` and passes them into `get_or_create_batch(...)`, which:
  - writes `targetDensity` (and unit) into the control definition `properties`, and
  - loads strain data from `composition_strain` when `composition_id` is set and writes `strains` into `properties`.

In the backup DB, all 438 DNA control micronix specimens have both density and composition_id populated (same source as DBS and whole-blood controls). No extra resolution step is required.
