import { api } from './client'
/**
 * Search result types from the unified search API
 */
export type SearchResultType = 
  | 'specimen'
  | 'container'
  | 'study'
  | 'subject'
  | 'micronix_plate'
  | 'cryovial_box'
  | 'box'
  | 'bag'
  | 'control_batch'

/**
 * Base search result structure
 */
export interface BaseSearchResult {
  type: SearchResultType
  id: number
  title: string
  subtitle: string
  url: string
  data: unknown
}

/**
 * Collection search results (plates, boxes, bags) include additional fields
 */
export interface CollectionSearchResult extends BaseSearchResult {
  type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
  name: string // Always present for collection types
  barcode?: string | null
  locationId?: number | null
  locationPath?: string | null
}

/**
 * Union type for all possible search results
 */
export type SearchResult = BaseSearchResult | CollectionSearchResult

/**
 * Search API response
 */
export interface SearchResponse {
  results: SearchResult[]
  query: string
  count: number
}

export const searchApi = {
  search: (query: string, type?: string) =>
    api.get<SearchResponse>('/search', {
      params: { q: query, type },
    }),
}

export const activityApi = {
  recent: (limit?: number) =>
    api.get<{ activity: Array<{ id: number; type: string; timestamp: string }> }>('/activity/recent', {
      params: { limit },
    }),
}
