import type { Context } from 'hono'
import type { StatisticsFilters } from './types'

/** Parse dashboard statistics query parameters from a Hono request. */
export function parseStatisticsFilters(c: Context): StatisticsFilters {
  const tagIdsParam = c.req.queries('tag_ids') || c.req.queries('tag_ids[]')
  const tagIds = tagIdsParam?.map((id) => parseInt(id)).filter((id) => !isNaN(id))

  return {
    study: c.req.query('study'),
    source_type: c.req.query('source_type'),
    specimen_type_id: c.req.query('specimen_type_id'),
    container_type: c.req.query('container_type'),
    tag_ids: tagIds,
    location_id: c.req.query('location_id'),
    collection_date_from: c.req.query('collection_date_from'),
    collection_date_to: c.req.query('collection_date_to'),
    created_from: c.req.query('created_from'),
    created_to: c.req.query('created_to'),
  }
}
