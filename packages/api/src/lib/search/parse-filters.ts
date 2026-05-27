import type { Context } from 'hono'
import type { SearchFilters } from './types'

/** Parse unified search query parameters from a Hono request. */
export function parseSearchFilters(c: Context): SearchFilters {
  return {
    q: c.req.query('q'),
    type: c.req.query('type'),
  }
}
