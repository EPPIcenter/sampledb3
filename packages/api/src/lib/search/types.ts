export type SearchResult = {
  type: string
  id: number
  title: string
  subtitle: string
  url: string
  name?: string
  barcode?: string | null
  locationId?: number | null
  locationPath?: string
  data: unknown
}

export type UnifiedSearchResponse = {
  results: SearchResult[]
  query: string
  count: number
}

export type SearchFilters = {
  q?: string
  type?: string
}

/** Map collection-specific type filters to the collection search bucket. */
export function resolveSearchTypes(type?: string): string[] {
  const normalizedType =
    type === 'micronix_plate' || type === 'cryovial_box' || type === 'box' || type === 'bag'
      ? 'collection'
      : type

  return normalizedType ? [normalizedType] : ['specimen', 'container', 'study', 'subject']
}
