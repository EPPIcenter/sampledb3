/**
 * Pagination constants for API endpoints
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 1000

/**
 * Validates and normalizes a pagination limit value
 * @param limit - The limit value to validate (can be string or number)
 * @returns A valid limit value between 1 and MAX_PAGE_SIZE
 */
export function validateLimit(limit: string | number | undefined): number {
  const parsed = typeof limit === 'string' ? parseInt(limit, 10) : limit
  if (isNaN(parsed as number) || parsed === undefined || parsed === null) {
    return DEFAULT_PAGE_SIZE
  }
  const num = Number(parsed)
  if (num < 1) return DEFAULT_PAGE_SIZE
  if (num > MAX_PAGE_SIZE) return MAX_PAGE_SIZE
  return num
}

/**
 * Validates and normalizes a page number
 * @param page - The page number to validate (can be string or number)
 * @returns A valid page number (minimum 1)
 */
export function validatePage(page: string | number | undefined): number {
  const parsed = typeof page === 'string' ? parseInt(page, 10) : page
  if (isNaN(parsed as number) || parsed === undefined || parsed === null) {
    return 1
  }
  const num = Number(parsed)
  return Math.max(1, num)
}

