/**
 * The row an `INSERT … RETURNING` wrote. SQLite always returns it, so an empty result is a bug:
 * throw rather than carry on with `undefined`.
 */
export function insertedRow<T>(rows: readonly T[], table: string): T {
  const row = rows.at(0)
  if (row === undefined) throw new Error(`Insert did not return ${table} row`)
  return row
}
