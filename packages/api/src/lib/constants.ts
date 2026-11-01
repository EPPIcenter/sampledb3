import type { Database } from '../db/client'
import { pageQueryParam } from './query-params'

// Cache for pagination settings
let paginationCache: { defaultPageSize: number; maxPageSize: number } | null = null

/**
 * Get pagination settings from cache or database
 * @param db - Database instance
 * @throws Error if pagination settings are not configured
 */
async function getPaginationSettings(db: Database): Promise<{ defaultPageSize: number; maxPageSize: number }> {
  if (paginationCache) {
    return paginationCache
  }

  const { getPaginationSettings } = await import('./settings')
  const settings = await getPaginationSettings(db)
  
  if (!settings) {
    throw new Error('Pagination settings are not configured. Please run database initialization.')
  }

  paginationCache = settings
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
