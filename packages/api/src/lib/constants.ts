import type { Database } from '../db/client'

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
 * Validates and normalizes a page number
 * @param page - The page number to validate (can be string or number)
 * @returns A valid page number (minimum 1)
 */
export function validatePage(page: string | number | undefined): number {
  const parsed = typeof page === 'string' ? parseInt(page, 10) : page
  if (isNaN(parsed as number) || parsed === undefined) {
    return 1
  }
  const num = Number(parsed)
  return Math.max(1, num)
}

