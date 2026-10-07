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

Use `openOperationalDatabase(optionalPath?)` from the client module. It resolves the file path, enables WAL, turns on foreign keys, runs schema evolution, and returns Drizzle + raw `bun:sqlite` handles. Importing the client module does **not** open a connection.

The rules for transactions, DDL, and which entry point to open a database with are under Database in `CODING_STANDARDS.md`.

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

Each migration runs in a transaction. On failure, the transaction rolls back, `schema_version` is unchanged, and startup throws `SchemaMigrationError` with the migration number. Restore from backup or fix the database manually; there are no down-migrations.
