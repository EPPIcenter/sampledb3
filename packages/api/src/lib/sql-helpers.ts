import { gte, lt, lte, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { shiftCalendarDate } from './datetime'

/**
 * Upper bound for a "to" date filter. A bare YYYY-MM-DD includes that whole day, so a
 * timestamp column ('2026-05-26 22:28:26') is compared with "< next day", not "<= date".
 */
export function dateToUpperBound(column: SQLiteColumn, dateTo: string) {
  const next = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? shiftCalendarDate(dateTo, 1) : null
  return next ? lt(column, next) : lte(column, dateTo)
}

/**
 * Conditions for a `created_from` / `created_to` query pair on a timestamp column. Either
 * bound may be absent; `dateTo` includes its whole day (see `dateToUpperBound`).
 */
export function dateRangeConditions(
  column: SQLiteColumn,
  dateFrom: string | undefined,
  dateTo: string | undefined,
): SQL[] {
  const conditions: SQL[] = []
  if (dateFrom) conditions.push(gte(column, dateFrom))
  if (dateTo) conditions.push(dateToUpperBound(column, dateTo))
  return conditions
}

/**
 * Ids per `IN (...)` list when a list is chunked. SQLite caps bound parameters per statement
 * (32766 today, 999 before 3.32); 500 stays far under either cap, leaving room for the
 * query's other parameters, while keeping the number of round trips low.
 */
export const SQL_IN_CHUNK_SIZE = 500

/** Batch an array into chunks for SQLite variable limits. */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
