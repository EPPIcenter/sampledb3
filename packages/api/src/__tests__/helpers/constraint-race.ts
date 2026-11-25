import type { Database as SQLiteDatabase } from 'bun:sqlite'

/**
 * Make every insert into `table` fail with a UNIQUE violation, the way a write fails when a
 * concurrent request took the row after the plan checked it. Use it to reach the 409 path of a
 * write that validates first.
 */
export function failInsertsWithUniqueViolation(sqlite: SQLiteDatabase, table: string): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS test_constraint_race (taken TEXT UNIQUE);
    INSERT OR IGNORE INTO test_constraint_race VALUES ('row');
    CREATE TRIGGER test_constraint_race_${table} BEFORE INSERT ON ${table}
    BEGIN
      INSERT INTO test_constraint_race VALUES ('row');
    END;
  `)
}
