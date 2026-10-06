# Operational database layer

SampleDB stores **operational data** (studies, subjects, specimens, containers, controls, and related records) in SQLite. This package owns how that file is opened, versioned, and evolved.

See [ADR 0003: SQLite schema evolution](../../../docs/adr/0003-sqlite-schema-evolution.md) for rationale (snapshot + deltas, no drizzle-kit migrate, fail-hard on error).

## Changing the schema

1. Edit Drizzle definitions in `schema.ts`.
2. Generate SQL: `bunx drizzle-kit generate` in `packages/api` (see `drizzle.config.ts`).
3. Add `packages/api/src/db/migrations/00N_short_name.sql` (statements separated with `--> statement-breakpoint`).
4. Bump `CURRENT_SCHEMA_VERSION` in `schema-evolution.ts`.
5. Run `bun run build` in `packages/api` — `scripts/runtime-assets.ts` copies migrations into `dist/db/migrations` and verifies the dist layout. If you add other on-disk runtime assets, register them in `RUNTIME_ASSETS` in that script.
6. Refresh `initial_schema.sql` so **new** empty databases match the latest shape (merge generated SQL; keep `INSERT INTO schema_version` at `CURRENT_SCHEMA_VERSION`). `__tests__/initial-schema-snapshot.test.ts` fails until the snapshot holds every table and column in `schema.ts`.
7. Extend the legacy fixtures if the migration touches a table they don't create. Older-version tests in `__tests__/schema-evolution.test.ts` build minimal databases through `createTablesForLaterMigrations`, and `__tests__/client.test.ts` creates its own tables inline; both must contain every table and column a later migration alters.

## How evolution works

| Database state | Behaviour |
|----------------|-----------|
| Empty file | Apply `initial_schema.sql` snapshot (includes current version row), then any pending migrations `002+`. |
| Has tables, no `schema_version` | Run legacy baseline `001` once, then pending migrations. |
| Has `schema_version` | Apply numbered migrations where `version < CURRENT`. |

Migration `001` is **only** for legacy files; fresh installs from the snapshot skip it.

## Schema version

- Table: `schema_version` with a single row (`version INTEGER NOT NULL`).
- Inspect in support: `SELECT version FROM schema_version;`

## Opening a database

Use `openOperationalDatabase(optionalPath?)` from the client module. It resolves the file path, enables WAL, turns on foreign keys, runs schema evolution, and returns Drizzle + raw `bun:sqlite` handles. Importing the client module does **not** open a connection.

The rules for transactions, DDL, and which entry point to open a database with are under Database in `CODING_STANDARDS.md`.

## Failures

Each migration runs in a transaction. On failure, the transaction rolls back, `schema_version` is unchanged, and startup throws `SchemaMigrationError` with the migration number. Restore from backup or fix the database manually; there are no down-migrations.
