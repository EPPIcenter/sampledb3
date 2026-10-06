# Specimen registration: one module, validation as a rolled-back write

---
status: accepted
---

Every write path that creates a **Container** ran its own checks before calling the shared writer `createContainerForSpecimen`: bulk combined import checked the same rows in four places (`bulk-combined-validate.ts`, its prepare step, an in-transaction revalidate, and the writer), `/specimens/bulk` had its own prepare module, and the derivation CSV had a hand-written validator. The checks drifted from the write. Validation looked plate collections up by barcode without falling back to name while the write fell back, so an occupied well passed validation and failed on import. Validation rejected two Papers on one **Sheet** that the write accepted. The derivation CSV validator assumed `micronix_tube` when no container type was given while the import rejected the row.

We put **Specimen registration** (see [CONTEXT.md](../../CONTEXT.md)) behind one module, `packages/api/src/lib/specimen-registration/`, and make validation the write itself, rolled back.

## Interface

- `registerSpecimens(db, entries, options)` plans every entry, refuses with all errors if any, otherwise writes. Called inside the caller's transaction, it joins it.
- `checkSpecimenRegistration(db, entries, options)` runs the same write in a transaction that is always rolled back and returns the errors. Callers whose own writes come first (bulk combined creates **Subjects**) wrap their whole write in `withRolledBackTransaction` instead.
- An entry is a resolved **Source** (`subjectId` or `controlBatchId`; derivations add a parent container later), a specimen type, an optional collection date, and `ContainerWriteInput`s ([ADR 0006](./0006-unified-container-inbound-write.md)) with optional unit and quantity. An entry may instead name an existing specimen to add containers to it.
- Errors are `{ entryIndex, containerIndex?, field?, message }`, keyed to the module's input. Callers map indexes back to CSV rows or form fields.

## Rules the module owns

- **Specimen identity**: (Source, specimen type, collection date), a missing date matching only a missing date. A match is reused and reported as `reused`; entries with the same key in one request become one Specimen.
- **Collection identity**: every identifier given (id, barcode, name) must resolve to the same **Collection**. One that misses while another matches, or two that match different collections, is an error. A Collection is created only when nothing matches and a location is given. Sheets are created under their box or bag when missing.
- **Placement**: one **Grid position** per container per collection, checked against the database and the rest of the request by resolved collection, after normalizing positions (`A2` → `A02`). Any number of Papers share a Sheet; a duplicate sublabel on one Sheet is an error.
- **Units**: an omitted unit takes the configured default for the container type; an unknown or disallowed unit is an error. No hardcoded container-type default.
- **Atomicity**: one call writes everything or nothing. Atomicity across calls is the caller's choice: bulk combined `per_subject` mode registers each subject in its own `withWriteTransaction`, which becomes a savepoint when an outer transaction is open, so a failed subject leaves nothing behind, its Subject row included.
- **Errors**: problems found while planning are a `SpecimenRegistrationError` with status 400 and the full error list. A constraint violation while writing is the same error with status 409.

## Considered options

- **Validate as a read-only plan, write separately**: rejected. "Validate passes ⇒ write succeeds" then holds only as far as the plan anticipates the schema, which is how the copies drifted. The rolled-back write costs a second set of inserts, which SQLite does in milliseconds for a CSV of thousands of rows.
- **Plan outside the transaction, execute inside**: rejected. The plan goes stale, which is why bulk combined needed an in-transaction revalidate.
- **Module owns Subjects and control batches too**: rejected. Each caller would need its own variant and the interface would grow back to the size of its callers. Callers create their Source records in the same transaction and pass ids.
- **First matching identifier wins**: rejected. It silently placed a tube in a plate whose barcode contradicted the row.

## Consequences

- Validate endpoints keep their wire shapes; each route maps module errors to its existing response.
- Migration is in slices, each deleting the code it replaces: bulk combined import; `/specimens/bulk`, `/subjects/with-specimens`, `POST /specimens` and add-container; derivations and the derivation CSV; control batches.
