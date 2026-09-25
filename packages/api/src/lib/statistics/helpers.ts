import { gte, lt, lte } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/** Build date filter conditions for specimen date columns. */
export function buildDateFilter(column: SQLiteColumn, dateFrom?: string, dateTo?: string) {
  const conditions: ReturnType<typeof gte>[] = []
  if (dateFrom) {
    conditions.push(gte(column, dateFrom))
  }
  if (dateTo) {
    conditions.push(dateToUpperBound(column, dateTo))
  }
  return conditions
}

/**
 * Upper bound for a "to" date filter. A bare YYYY-MM-DD includes that whole day, so a
 * timestamp column ('2026-05-26 22:28:26') is compared with "< next day", not "<= date".
 */
export function dateToUpperBound(column: SQLiteColumn, dateTo: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateTo)
  if (!match) return lte(column, dateTo)
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1))
  return lt(column, next.toISOString().slice(0, 10))
}

/** Batch an array into chunks for SQLite variable limits. */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
