import { lt, lte } from 'drizzle-orm'
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

/** Batch an array into chunks for SQLite variable limits. */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
