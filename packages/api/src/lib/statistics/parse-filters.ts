import type { Context } from 'hono'
import { collectionDateFilter, timestampFilter } from '../date-filters'
import { idListQueryParam, idQueryParam } from '../query-params'
import type { StatisticsFilters } from './types'

/**
 * Parse dashboard statistics query parameters from a Hono request. A malformed date bound or
 * a non-numeric id throws a `ValidationError` (400).
 */
export function parseStatisticsFilters(c: Context): StatisticsFilters {
  const tagIds = idListQueryParam('tag_ids', c.req.queries('tag_ids') || c.req.queries('tag_ids[]'))

  return {
    study: c.req.query('study'),
    source_type: c.req.query('source_type'),
    specimen_type_id: idQueryParam('specimen_type_id', c.req.query('specimen_type_id')),
    container_type: c.req.query('container_type'),
    tag_ids: tagIds,
    location_id: idQueryParam('location_id', c.req.query('location_id')),
    collection_date_from: collectionDateFilter('collection_date_from', c.req.query('collection_date_from')),
    collection_date_to: collectionDateFilter('collection_date_to', c.req.query('collection_date_to')),
    created_from: timestampFilter('created_from', c.req.query('created_from')),
    created_to: timestampFilter('created_to', c.req.query('created_to')),
  }
}
