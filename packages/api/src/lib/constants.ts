import type { Database } from '../db/client'
import { pageQueryParam } from './query-params'

/**
 * Get pagination settings through the settings cache, which is keyed per database and
 * cleared when an admin saves settings, so a new page size applies without a restart.
 * @param db - Database instance
 * @throws Error if pagination settings are not configured
 */
async function getPaginationSettings(db: Database): Promise<{ defaultPageSize: number; maxPageSize: number }> {
  const { getPaginationSettings } = await import('./settings')
  const settings = await getPaginationSettings(db)

  if (!settings) {
    throw new Error('Pagination settings are not configured. Please run database initialization.')
  }

  return settings
}

/**
 * Validates and normalizes a pagination limit value
 * @param db - Database instance
 * @param limit - The limit value to validate (can be string or number)
 * @returns A valid limit value between 1 and MAX_PAGE_SIZE
 */
export async function validateLimit(db: Database, limit: string | number | undefined): Promise<number> {
  const settings = await getPaginationSettings(db)
  const parsed = typeof limit === 'string' ? parseInt(limit, 10) : limit
  if (isNaN(parsed as number) || parsed === undefined) {
    return settings.defaultPageSize
  }
  const num = Number(parsed)
  if (num < 1) return settings.defaultPageSize
  if (num > settings.maxPageSize) return settings.maxPageSize
  return num
}

/**
 * Validates and normalizes a page number: page 1 when omitted or not a number, at least 1, and
 * a `ValidationError` (400) above `MAX_PAGE`. `name` is the query parameter, for the message.
 */
export function validatePage(page: string | number | undefined, name = 'page'): number {
  return pageQueryParam(page, name)
}
