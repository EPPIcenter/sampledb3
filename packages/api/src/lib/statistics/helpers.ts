import { gte, lte } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/** Build date filter conditions for specimen date columns. */
export function buildDateFilter(column: SQLiteColumn, dateFrom?: string, dateTo?: string) {
  const conditions: ReturnType<typeof gte>[] = []
  if (dateFrom) {
    conditions.push(gte(column, dateFrom))
  }
  if (dateTo) {
    conditions.push(lte(column, dateTo))
  }
  return conditions
}

/** Batch an array into chunks for SQLite variable limits. */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
