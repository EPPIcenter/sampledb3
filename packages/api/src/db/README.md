# Operational database layer

SampleDB stores **operational data** (studies, subjects, specimens, containers, controls, and related records) in SQLite. This package owns how that file is opened, versioned, and evolved.

See [ADR-0003: SQLite schema evolution](../../../docs/adr/0003-sqlite-schema-evolution.md) for rationale (snapshot + deltas, no drizzle-kit migrate, fail-hard on error).

## Opening a database

Use `openOperationalDatabase(optionalPath?)` from the client module. It resolves the file path, enables WAL, runs schema evolution, and returns Drizzle + raw `bun:sqlite` handles. Importing the client module does **not** open a connection.

Tests should use the same entry point (e.g. `openOperationalDatabase(':memory:')` via `setupTestDatabase()`).

## Schema version

- Table: `schema_version` with a single row (`version INTEGER NOT NULL`).
- Constant: `CURRENT_SCHEMA_VERSION` in `schema-evolution.ts`.
- Inspect in support: `SELECT version FROM schema_version;`

## How evolution works

| Database state | Behaviour |
|----------------|-----------|
| Empty file | Apply `initial_schema.sql` snapshot (includes current version row), then any pending migrations `002+`. |
| Has tables, no `schema_version` | Run legacy baseline `001` once, then pending migrations. |
| Has `schema_version` | Apply numbered migrations where `version < CURRENT`. |

Migration `001` is **only** for legacy files; fresh installs from the snapshot skip it.

## Changing the schema

1. Edit Drizzle definitions in `schema.ts`.
2. Generate SQL: `bunx drizzle-kit generate` in `packages/api` (see `drizzle.config.ts`).
3. Add `packages/api/src/db/migrations/00N_short_name.sql` (statements separated with `--> statement-breakpoint`).
4. Bump `CURRENT_SCHEMA_VERSION` in `schema-evolution.ts`.
5. Refresh `initial_schema.sql` so **new** empty databases match the latest shape (merge generated SQL; keep `INSERT INTO schema_version` at `CURRENT_SCHEMA_VERSION`).

Do **not** add inline DDL to `open.ts` or connection code.

## Failures

Each migration runs in a transaction. On failure, the transaction rolls back, `schema_version` is unchanged, and startup throws `SchemaMigrationError` with the migration number. Restore from backup or fix the database manually; there are no down-migrations.
