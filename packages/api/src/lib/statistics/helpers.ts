import { gte } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { dateToUpperBound } from '../sql-helpers'

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
