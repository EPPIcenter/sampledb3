import { sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/** Escape LIKE wildcards so "%" and "_" in user text match themselves. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** `column LIKE '%text%'` with the text taken literally (a "_" in "3D7_0.05" is not a wildcard). */
export function likeContains(column: SQLiteColumn | SQL, text: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(text)}%`} ESCAPE '\\'`
}
