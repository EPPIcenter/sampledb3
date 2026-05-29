# SQLite schema evolution (snapshot + versioned deltas)

---
status: accepted
---

SampleDB’s API stores **operational data** in a single SQLite file per deployment. Schema changes must work for empty installs, long-lived production files created before versioning, and the existing test harness—without inline DDL in the connection module or a separate migration framework.

We use an **explicit schema cursor**: table `schema_version` with a single row (`version INTEGER NOT NULL`). **Version 1** means “matches `packages/api/initial_schema.sql` as of the refactor that introduced versioning,” including `schema_version` and `INSERT` of `1` in that snapshot. **Empty databases** apply the snapshot only (fast path), then skip deltas because version is already current. **Legacy databases** (tables exist, no `schema_version`) run one idempotent SQL migration `001_legacy_baseline.sql` (today’s probe patches, `DROP` the unused `version` table, create `schema_version`, set version to `1`), then only numbered deltas `002+` on upgrade. **Future changes** add a new `00N_*.sql` delta, bump `CURRENT_VERSION` in code, and refresh `initial_schema.sql` so new installs and upgraded files converge (dual path). Deltas are plain SQL under `packages/api/src/db/migrations/`, executed by a small in-repo runner (statement-breakpoint split, transactional, **fail hard** on error—no version bump unless the delta commits). We keep **`drizzle-kit generate`** to diff `schema.ts` into SQL; we do **not** adopt `drizzle-kit migrate` or another migration framework. The lifecycle is opened via **`openOperationalDatabase`** in `db/open.ts` with evolution in `db/schema-evolution.ts`; **`createDatabase` is renamed in one breaking pass** (no deprecated alias). Module-level DB open on import is removed; tests use the same open path as production (E4 scope).

## Considered options

- **Implicit / probe-based evolution** — rejected; logic spread across `client.ts` and untested in the main test path.
- **Deltas-only (no snapshot)** — rejected; slower empty install and abandons the workflow tests already rely on.
- **Drizzle Kit migrate journal** — rejected; fights the snapshot fast path and legacy baseline control.
- **`PRAGMA user_version`** — rejected; harder to inspect and absent from Drizzle/schema dumps.
- **Repurpose existing `version` table** — rejected; unused, ambiguous name; dropped instead.

## Consequences

- Maintainers: after `schema.ts` changes, generate SQL, add `00N` migration, refresh `initial_schema.sql`, bump `CURRENT_VERSION`.
- Operators: failed migration prevents API start; restore from backup or fix DB manually (no down-migrations in v1).
- `packages/api/src/db/README.md` (added in implementation) documents the workflow; this ADR records why.
