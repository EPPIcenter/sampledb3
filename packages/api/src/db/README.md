# Operational database layer

SampleDB stores **operational data** (studies, subjects, specimens, containers, controls, and related records) in SQLite. This package owns how that file is opened, versioned, and evolved.

See [ADR 0003: SQLite schema evolution](../../../docs/adr/0003-sqlite-schema-evolution.md) for rationale (snapshot + deltas, no drizzle-kit migrate, fail-hard on error).

## Changing the schema

1. Edit Drizzle definitions in `schema.ts`.
2. Generate SQL: `bunx drizzle-kit generate` in `packages/api` (see `drizzle.config.ts`).
3. Add `packages/api/src/db/migrations/00N_short_name.sql` (statements separated with `--> statement-breakpoint`).
4. Bump `CURRENT_SCHEMA_VERSION` in `schema-evolution.ts`.
5. Run `bun run build` in `packages/api` — `scripts/runtime-assets.ts` copies migrations into `dist/db/migrations` and verifies the dist layout. If you add other on-disk runtime assets, register them in `RUNTIME_ASSETS` in that script.
6. Refresh `initial_schema.sql` so **new** empty databases match the latest shape (merge generated SQL; keep `INSERT INTO schema_version` at `CURRENT_SCHEMA_VERSION`). `__tests__/initial-schema-snapshot.test.ts` fails until the snapshot matches a database built by the migrations: columns, types, NOT NULL, defaults, indexes, and foreign keys.
7. Extend the legacy fixtures if the migration touches a table they don't create. Older-version tests in `__tests__/schema-evolution.test.ts` build minimal databases through `createTablesForLaterMigrations`, and `__tests__/client.test.ts` creates its own tables inline; both must contain every table and column a later migration alters.

## One-time data fixes

A migration ships to every install and runs at startup, so it must be correct on any database: it may not name rows by id or carry out one lab's decisions about its own data, and it must not abort on data another install could legitimately hold. A change to one install's data is a **data fix** (CONTEXT.md) instead: a SQL file an operator runs by hand.

```bash
bun run data-fix <fix.sql> [--db=path/to/database.sqlite] [--dry-run]
```

`src/scripts/data-fix.ts` is the CLI; `runDataFix` in `data-fix.ts` does the work. It opens the file directly, not through `openOperationalDatabase`, because a data fix must not migrate the database, and it:

1. refuses a database whose `schema_version` is not `CURRENT_SCHEMA_VERSION`;
2. does nothing, and says so, if `data_fix_log` already records the fix's name with the same checksum, and refuses if the checksum differs;
3. copies the database with `VACUUM INTO` (as `migration-backup.ts` does before migrations) to `<database file>.pre-data-fix-<name>-<UTC timestamp>.bak`;
4. runs the statements (split on `--> statement-breakpoint`) in one `BEGIN IMMEDIATE` transaction, with foreign keys on, and records `(name, checksum, applied_at)` in `data_fix_log` in the same transaction;
5. prints the rows each statement changed (`total_changes()`, so trigger and foreign-key changes count), labelled by the `--` comment just above it.

`--dry-run` does steps 1, 2 and 4 in a transaction it rolls back, and writes no copy and no record.

`data_fix_log` belongs to the runner, not the operational schema: it is created on the first fix and is absent from `schema.ts`, `initial_schema.sql`, and databases no fix ran on.

**Fix files are site-specific.** `ops/data-fixes/` holds the EPPIcenter lab's fixes for its own database; other installs must not run them. Start each file with a header naming the database it is for, the decision it carries out, and a warning not to run it elsewhere. Guard it: check that the rows it changes are the ones that were reviewed, and abort (for example with a temp trigger that `RAISE(ABORT, …)`s, as `2026-11-01-eppicenter-legacy-cleanup.sql` does) when they are not. A test under `__tests__/data-fixes/` runs the lab's fix against a database seeded in production's shape. The operator steps are in the deployment guide in `packages/docs` (One-time data fixes).

## How evolution works

| Database state | Behaviour |
|----------------|-----------|
| Empty file | Apply `initial_schema.sql` snapshot (includes current version row), then any pending migrations `002+`. |
| Has tables, no `schema_version` | Run legacy baseline `001` once, then pending migrations. |
| Has `schema_version` | Apply numbered migrations where `version < CURRENT`. |

Migration `001` is **only** for legacy files; fresh installs from the snapshot skip it.

## Schema version

- Table: `schema_version` with a single row (`version INTEGER NOT NULL`).
- Constant: `CURRENT_SCHEMA_VERSION` in `schema-evolution.ts`, the version the code expects. "How evolution works" calls it `CURRENT`.
- Inspect in support: `SELECT version FROM schema_version;`

## Opening a database

Use `openOperationalDatabase(optionalPath?)` from the client module. It resolves the file path, enables WAL, turns on foreign keys, runs schema evolution (backing up the file first when a migration is pending, see Failures), and returns Drizzle + raw `bun:sqlite` handles. Importing the client module does **not** open a connection.

The rules for transactions, DDL, and which entry point to open a database with are under Database in `CODING_STANDARDS.md`.

**Exception: read-only inspection.** `scripts/check-integrity.ts` opens the file with `new Database(path, { readonly: true })` instead. It is often pointed at a backup, and `openOperationalDatabase` would migrate it and enable WAL (both are writes). Resolve the path with `resolveOperationalDatabasePath` so it finds the same file. Any other tool that only reads, and must leave the file as it found it, should do the same.

## Transactions

The API shares one `bun:sqlite` connection across all requests, so a transaction that stays open across `await` is visible to every request that runs while it is open. Use the helpers in `write-transaction.ts`:

| Helper | Use it to | Ends with |
|--------|-----------|-----------|
| `withWriteTransaction(db, fn)` | Run multi-statement writes that `await` | `COMMIT`, or `ROLLBACK` if `fn` throws |
| `withRolledBackTransaction(db, fn)` | Check that a write would succeed by performing it (validate routes) | `ROLLBACK`, always |

### Concurrency model

- **One transaction at a time per connection.** A process-wide lock per connection serializes the helpers. A call from another async context, such as another request, waits for the lock and then runs its own `BEGIN`.
- **Nesting follows the async context.** The open transaction is kept in an `AsyncLocalStorage`. A helper called from inside another helper's `fn` runs in a `SAVEPOINT` of the open transaction instead of waiting. If the nested `fn` throws, only its own writes roll back. A nested `withRolledBackTransaction` always rolls back to its savepoint and leaves the outer transaction's earlier writes in place.
- **A transaction opened outside the helpers** (a raw `sqlite.exec('BEGIN')`, as some tests do) is not the helpers' to commit: a helper called while one is open runs in a savepoint inside it.

### What the lock does not cover

The lock only orders the helpers. A write made outside them runs immediately and synchronously, and if another context has a helper's transaction open at that moment the write lands in that transaction:

- If that transaction commits, the write commits with it.
- If it rolls back (a failed import, or any `withRolledBackTransaction` validate), the write is lost, though the request that made it has already reported success.

Writes outside the helpers include plain `db.insert/update/delete` calls (about 220 in 38 files under `routes/`, `lib/`, and `middleware/`, among them session writes on login, rate-limit counters, and the error log that `handleRouteError` writes) and Drizzle's synchronous `db.transaction((tx) => …)`, which bun:sqlite turns into a savepoint inside the open transaction. Routing them through the lock would mean making every write in the API wait on an async lock; it has not been done. The exposure lasts as long as a helper's transaction stays open across `await`.

When you add a multi-statement write, use `withWriteTransaction` instead of adding to that list.

## Failures

Each migration runs in a transaction. On failure, the transaction rolls back, `schema_version` is unchanged, and startup throws `SchemaMigrationError` with the migration number. There are no down-migrations, so a migration that succeeds but leaves bad data can only be undone from a copy.

### Backup before migrating

Before the first migration changes an existing file (a numbered migration, or the legacy baseline `001`), `openOperationalDatabase` writes a copy next to it with `VACUUM INTO`, which includes pages still in the WAL:

```
<database file>.pre-v<CURRENT_SCHEMA_VERSION>-<UTC timestamp>.bak
e.g. sampledb.sqlite.pre-v11-20261101T143005123Z.bak
```

The version in the name is the one the migrations move to; the copy itself holds the version it had before. `migration-backup.ts` writes it, and `evolveOperationalSchema` calls it when passed `{ backupBeforeMigrating: true }`.

- No copy when nothing is pending, when the file was empty (the snapshot path), or for `:memory:`.
- `openOperationalDatabase` skips the copy under `NODE_ENV=test`; pass `{ backupBeforeMigrating: true }` to force it.
- If the copy can't be written (read-only directory, full disk), startup throws `MigrationBackupError` before any migration runs, and the database is unchanged.

Copies are never deleted automatically. The deployment guide in `packages/docs` says when to remove them.
